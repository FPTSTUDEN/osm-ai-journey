import { get, put, remove } from './db'

const STORE = 'companion-art'
const LEGACY_KEY = 'active'

export async function loadCompanionArt(personaId = 'wayfinder') {
  const record = await get<{ key: string; image: Blob }>(STORE, personaId)
  if (record?.image) return record.image
  if (personaId === 'wayfinder') {
    const legacy = await get<{ key: string; image: Blob }>(STORE, LEGACY_KEY)
    return legacy?.image ?? null
  }
  return null
}

export function saveCompanionArt(image: Blob, personaId = 'wayfinder') {
  return put(STORE, { key: personaId, image })
}

export async function deleteCompanionArt(personaId = 'wayfinder') {
  await remove(STORE, personaId)
  if (personaId === 'wayfinder') await remove(STORE, LEGACY_KEY)
}
