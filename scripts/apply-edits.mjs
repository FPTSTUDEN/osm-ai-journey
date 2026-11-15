#!/usr/bin/env node
// scripts/apply-edits.mjs
// Apply a JSON edit list to the working tree. Fails closed.
// Preserves each file's existing line endings (LF or CRLF).
// Usage: node scripts/apply-edits.mjs <edits.json> [--dry-run] [--strict-eol]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [, , jsonPath, ...flags] = process.argv
const dryRun = flags.includes('--dry-run')
const strictEol = flags.includes('--strict-eol')

if (!jsonPath) {
  console.error('usage: node scripts/apply-edits.mjs <edits.json> [--dry-run] [--strict-eol]')
  process.exit(2)
}

const edits = JSON.parse(readFileSync(jsonPath, 'utf8'))
if (!Array.isArray(edits)) {
  console.error('edits.json must be a JSON array')
  process.exit(2)
}

const staged = new Map()   // file -> { original (LF), next (LF), eol, rawLength, move? }
const created = new Set()
const createdEol = new Map() // file -> '\r\n' | '\n'

// ---------- line-ending helpers ----------

function eolOf(src) {
  const crlf = (src.match(/\r\n/g) ?? []).length
  const lf = (src.match(/(?<!\r)\n/g) ?? []).length
  if (crlf === 0 && lf === 0) return '\n'
  return crlf > lf ? '\r\n' : '\n'
}

function isMixed(src) {
  return (src.match(/\r\n/g) ?? []).length > 0 && (src.match(/(?<!\r)\n/g) ?? []).length > 0
}

function toLf(src) {
  return src.replace(/\r\n/g, '\n')
}

function fromLf(src, eol) {
  return eol === '\r\n' ? src.replace(/\n/g, '\r\n') : src
}

// ---------- staging ----------

function stage(file) {
  if (staged.has(file)) return staged.get(file)
  if (!existsSync(file)) throw new Error(`${file}: not found`)
  const raw = readFileSync(file, 'utf8')
  const mixed = isMixed(raw)
  if (mixed) {
    if (strictEol) throw new Error(`${file}: mixed line endings (normalize first or drop --strict-eol)`)
    console.warn(`note: ${file} has mixed line endings; using ${JSON.stringify(eolOf(raw))}`)
  }
  const eol = eolOf(raw)
  const entry = { original: toLf(raw), next: toLf(raw), eol, rawLength: raw.length }
  staged.set(file, entry)
  return entry
}

// ---------- matching helpers ----------

function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let n = 0, i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length }
  return n
}

function nthIndex(haystack, needle, n) {
  let i = -1
  for (let k = 0; k < n; k++) {
    i = haystack.indexOf(needle, i + 1)
    if (i === -1) return -1
  }
  return i
}

function lineRange(src, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    throw new Error(`invalid line range ${from}..${to}`)
  const lines = src.split('\n')
  if (to > lines.length) throw new Error(`line ${to} beyond EOF (${lines.length})`)
  return { lines }
}

function checkExpect(src, from, expectStart) {
  if (expectStart === undefined) return
  const { lines } = lineRange(src, from, from)
  if (!lines[from - 1].includes(expectStart))
    throw new Error(`line ${from} does not contain ${JSON.stringify(expectStart)} (found ${JSON.stringify(lines[from - 1])})`)
}

function short(s) {
  return s.length > 60 ? JSON.stringify(s.slice(0, 57) + '…') : JSON.stringify(s)
}

// ---------- ops ----------

const ops = {
  create(e) {
    const eol = e.eol === 'crlf' ? '\r\n' : '\n'
    if (existsSync(e.file)) {
      const current = readFileSync(e.file, 'utf8')
      if (toLf(current) === toLf(e.with)) {
        created.add(e.file)
        staged.set(e.file, { original: toLf(current), next: toLf(e.with), eol: eolOf(current), rawLength: current.length })
        return
      }
      throw new Error(`${e.file}: already exists with different content`)
    }
    createdEol.set(e.file, eol)
    created.add(e.file)
    staged.set(e.file, { original: '', next: toLf(e.with), eol, rawLength: 0 })
  },
  overwrite(e) {
    if (!existsSync(e.file)) throw new Error(`${e.file}: not found (use create)`)
    const raw = readFileSync(e.file, 'utf8')
    const eol = eolOf(raw)
    if (isMixed(raw)) {
      if (strictEol) throw new Error(`${e.file}: mixed line endings`)
      console.warn(`note: ${e.file} has mixed line endings; using ${JSON.stringify(eol)}`)
    }
    staged.set(e.file, { original: toLf(raw), next: toLf(e.with), eol, rawLength: raw.length })
  },
  replace(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.find)
    if (n !== 1) throw new Error(`${e.file}: anchor matched ${n}x (expected 1): ${short(e.find)}`)
    entry.next = entry.next.replace(e.find, () => e.with)
  },
  replaceAll(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.find)
    if (n !== e.count) throw new Error(`${e.file}: anchor matched ${n}x (expected ${e.count}): ${short(e.find)}`)
    entry.next = entry.next.split(e.find).join(e.with)
  },
  replaceNth(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.find)
    if (n !== e.count) throw new Error(`${e.file}: anchor matched ${n}x (expected ${e.count}): ${short(e.find)}`)
    const idx = nthIndex(entry.next, e.find, e.n)
    if (idx === -1) throw new Error(`${e.file}: occurrence ${e.n} not found`)
    entry.next = entry.next.slice(0, idx) + e.with + entry.next.slice(idx + e.find.length)
  },
  replaceBetween(e) {
    const entry = stage(e.file)
    const s = countOccurrences(entry.next, e.start)
    const t = countOccurrences(entry.next, e.end)
    if (s !== 1) throw new Error(`${e.file}: start anchor matched ${s}x (expected 1): ${short(e.start)}`)
    if (t !== 1) throw new Error(`${e.file}: end anchor matched ${t}x (expected 1): ${short(e.end)}`)
    const i = entry.next.indexOf(e.start)
    const j = entry.next.indexOf(e.end, i + e.start.length)
    if (j === -1) throw new Error(`${e.file}: end anchor not after start anchor`)
    entry.next = entry.next.slice(0, i) + e.with + entry.next.slice(j + e.end.length)
  },
  replaceLines(e) {
    const entry = stage(e.file)
    checkExpect(entry.next, e.from, e.expectStart)
    const { lines } = lineRange(entry.next, e.from, e.to)
    const before = lines.slice(0, e.from - 1)
    const after = lines.slice(e.to)
    entry.next = [...before, ...e.with.split('\n'), ...after].join('\n')
  },
  delete(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.find)
    if (n !== 1) throw new Error(`${e.file}: anchor matched ${n}x (expected 1): ${short(e.find)}`)
    entry.next = entry.next.replace(e.find, '')
  },
  deleteLines(e) {
    const entry = stage(e.file)
    checkExpect(entry.next, e.from, e.expectStart)
    const { lines } = lineRange(entry.next, e.from, e.to)
    entry.next = [...lines.slice(0, e.from - 1), ...lines.slice(e.to)].join('\n')
  },
  insertBefore(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.anchor)
    if (n !== 1) throw new Error(`${e.file}: anchor matched ${n}x (expected 1): ${short(e.anchor)}`)
    entry.next = entry.next.replace(e.anchor, () => e.with + e.anchor)
  },
  insertAfter(e) {
    const entry = stage(e.file)
    const n = countOccurrences(entry.next, e.anchor)
    if (n !== 1) throw new Error(`${e.file}: anchor matched ${n}x (expected 1): ${short(e.anchor)}`)
    entry.next = entry.next.replace(e.anchor, () => e.anchor + e.with)
  },
  move(e) {
    if (existsSync(e.to)) throw new Error(`${e.to}: destination exists`)
    staged.set(`MOVE:${e.from}->${e.to}`, { original: '', next: '', eol: '\n', rawLength: 0, move: [e.from, e.to] })
  },
}

// ---------- dry-run diff ----------

function printDiff(file, entry) {
  const a = entry.original.split('\n')
  const b = entry.next.split('\n')
  let first = -1, last = -1
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) { if (first < 0) first = i; last = i }
  }
  if (first < 0) { console.log(`(no change) ${file}`); return }
  console.log(`\n--- ${file}`)
  for (let i = Math.max(0, first - 2); i <= Math.min(b.length - 1, last + 2); i++) {
    const sign = a[i] === b[i] ? ' ' : (a[i] === undefined ? '+' : b[i] === undefined ? '-' : '~')
    console.log(`${sign} ${String(i + 1).padStart(4)} ${b[i] ?? a[i]}`)
  }
}

// ---------- run ----------

let failures = 0
for (const [i, e] of edits.entries()) {
  const label = e.file ?? (e.op === 'move' ? `${e.from} -> ${e.to}` : '(unknown)')
  try {
    const fn = ops[e.op]
    if (!fn) throw new Error(`unknown op ${JSON.stringify(e.op)}`)
    fn(e)
    if (!dryRun) {
      console.log(`OK  #${i + 1} ${e.op} ${label}`)
    } else if (e.file && staged.has(e.file)) {
      const entry = staged.get(e.file)
      if (entry.eol === '\r\n') console.log(`(EOL: CRLF preserved) ${e.file}`)
      printDiff(e.file, entry)
    }
  } catch (err) {
    failures++
    console.error(`FAIL #${i + 1} ${e.op} ${label}: ${err.message}`)
  }
}

if (failures) {
  console.error(`\n${failures} op(s) failed — nothing was written.`)
  process.exit(1)
}

if (dryRun) {
  console.log('\nDry run — no files written.')
  process.exit(0)
}

// ---------- write ----------

let written = 0
for (const [file, entry] of staged) {
  if (entry.move) {
    const [from, to] = entry.move
    execFileSync('git', ['mv', from, to], { stdio: 'inherit' })
    written++
    continue
  }
  const eol = createdEol.get(file) ?? entry.eol
  const out = fromLf(entry.next, eol)
  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8')
    if (current === out) continue
  }
  writeFileSync(file, out)
  written++
  const flavor = eol === '\r\n' ? 'CRLF' : 'LF'
  console.log(`   wrote ${file} (${flavor})`)
}

console.log(`\nApplied ${edits.length} op(s); ${written} file(s) changed.`)