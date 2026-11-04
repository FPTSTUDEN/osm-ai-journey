import { get, put } from './db'

const STORE_NAME = 'live-data'

export type LiveCacheRecord<T> = {
  value: T
  fetchedAt: number
  expiresAt: number
}

export async function readLiveCache<T>(key: string): Promise<LiveCacheRecord<T> | null> {
  try {
    const record = await get<LiveCacheRecord<T> & { key: string }>(STORE_NAME, key)
    return record ? { value: record.value, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt } : null
  } catch {
    return null
  }
}

export async function writeLiveCache<T>(key: string, value: T, ttlMs: number) {
  try {
    const fetchedAt = Date.now()
    await put(STORE_NAME, { key, value, fetchedAt, expiresAt: fetchedAt + ttlMs })
  } catch {
    // Live data remains optional when browser storage is unavailable.
  }
}
