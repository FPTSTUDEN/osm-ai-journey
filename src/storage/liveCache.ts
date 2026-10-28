const DATABASE_NAME = 'osm-ai-journey'
const STORE_NAME = 'live-data'
const DATABASE_VERSION = 3

export type LiveCacheRecord<T> = {
  value: T
  fetchedAt: number
  expiresAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('geocoder-results')) database.createObjectStore('geocoder-results', { keyPath: 'key' })
      if (!database.objectStoreNames.contains('journeys')) database.createObjectStore('journeys', { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readLiveCache<T>(key: string): Promise<LiveCacheRecord<T> | null> {
  try {
    const database = await openDatabase()
    const record = await new Promise<(LiveCacheRecord<T> & { key: string }) | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as (LiveCacheRecord<T> & { key: string }) | undefined)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return record ? { value: record.value, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt } : null
  } catch {
    return null
  }
}

export async function writeLiveCache<T>(key: string, value: T, ttlMs: number) {
  try {
    const database = await openDatabase()
    const fetchedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ key, value, fetchedAt, expiresAt: fetchedAt + ttlMs })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    database.close()
  } catch {
    // Live data remains optional when browser storage is unavailable.
  }
}
