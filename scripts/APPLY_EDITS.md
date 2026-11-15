# Applying automated edits

Every edit list is a JSON array of **ops**. The runner (`scripts/apply-edits.mjs`)
applies them in order, **fails closed** on any ambiguity, and prints a summary.
It never guesses.

## Hard rules (enforced by the runner)

1. **Uniqueness.** `replace` / `insertBefore` / `insertAfter` / `delete` require the
   anchor string to match **exactly once** in the file. More or fewer matches → error,
   file untouched.
2. **Line numbers are checked.** `replaceLines` and `deleteLines` re-read the file and
   verify the given range still starts with the expected `expectStart` string (or
   `expectEnd` for the tail). Mismatch → error, file untouched.
3. **No partial writes.** Each op is applied to an in-memory buffer; the file is
   written only after the whole op succeeds. If any op in the list throws, no file
   is written at all (the runner stages every result and flushes at the end).
4. **Scope.** The runner refuses to touch a file it wasn't given in the JSON, and
   refuses `create` on a path that already exists (use `replace` for that).
5. **Line endings.** LF is preserved. CRLF files are rejected with a clear error
   (normalize first, or ask me for a full-file block).
6. **Reporting.** The runner prints one line per op: `OK <op> <file>` or
   `FAIL <op> <file>: <reason>`; the exit code is 0 iff everything succeeded.
   `--dry-run` prints the diff of every op without writing.

## Op reference

| `op`             | Required fields                                    | Notes |
|------------------|----------------------------------------------------|-------|
| `create`         | `file`, `with`                                     | Fails if `file` exists. |
| `replace`        | `file`, `find`, `with`                             | `find` must occur **exactly once**. |
| `replaceAll`     | `file`, `find`, `with`                             | Deliberate global replace; requires `count` = expected occurrences. |
| `replaceNth`     | `file`, `find`, `with`, `n`                        | 1-based; requires `count` = expected total. |
| `replaceBetween` | `file`, `start`, `end`, `with`                     | Replaces `start`…`end` inclusive; both anchors must be unique. |
| `replaceLines`   | `file`, `from`, `to`, `with`, `expectStart`        | 1-based inclusive; `expectStart` is the current text of line `from`. |
| `delete`         | `file`, `find`                                     | `find` must occur **exactly once**. |
| `deleteLines`    | `file`, `from`, `to`, `expectStart`                | 1-based inclusive. |
| `insertBefore`   | `file`, `anchor`, `with`                           | `anchor` must occur **exactly once**. |
| `insertAfter`    | `file`, `anchor`, `with`                           | `anchor` must occur **exactly once**. |
| `move`           | `from`, `to`                                       | Uses `git mv` semantics; runner shells out to `git mv`. |

`with` strings are inserted verbatim (no escaping, no indentation rewrite) — the
caller is responsible for whitespace.

## Workflow

```bash
# 1. Author edits.json (the assistant emits it; you review)
# 2. Dry run — shows every change, writes nothing
node scripts/apply-edits.mjs edits.json --dry-run
# 3. Apply
node scripts/apply-edits.mjs edits.json
# 4. Verify (always, per repo conventions)
pnpm exec tsc -b && pnpm test:unit && pnpm test:e2e

If the runner fails, nothing is written — fix the JSON and re-run. If you need to
recover from a half-applied git apply patch (the other format), use
git apply --reject and inspect *.rej.