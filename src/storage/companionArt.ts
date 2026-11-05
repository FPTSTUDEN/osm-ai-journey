import { get, put, remove } from './db'

const STORE = 'companion-art'
const KEY = 'active'

export function loadCompanionArt() {
  return get<{ key: string; image: Blob }>(STORE, KEY).then((record) => record?.image ?? null)
}

export function saveCompanionArt(image: Blob) {
  return put(STORE, { key: KEY, image })
}

export function deleteCompanionArt() {
  return remove(STORE, KEY)
}
