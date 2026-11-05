import { get, put } from './db'

const STORE_NAME = 'geocoder-results'

type CacheRecord<T> = {
  key: string
  value: T
  expiresAt: number
}

export async function readCachedValue<T>(key: string): Promise<T | null> {
  try {
    const record = await get<CacheRecord<T>>(STORE_NAME, key)
    if (!record || record.expiresAt <= Date.now()) return null
    return record.value
  } catch {
    return null
  }
}

export async function writeCachedValue<T>(key: string, value: T, expiresAt: number) {
  try {
    await put(STORE_NAME, { key, value, expiresAt })
  } catch {
    // Geocoding remains available when IndexedDB is blocked or unavailable.
  }
}
