const DATABASE_NAME = 'osm-ai-journey'
const STORE_NAME = 'geocoder-results'
const DATABASE_VERSION = 2

type CacheRecord<T> = {
  key: string
  value: T
  expiresAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      if (!database.objectStoreNames.contains('journeys')) database.createObjectStore('journeys', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readCachedValue<T>(key: string): Promise<T | null> {
  try {
    const database = await openDatabase()
    const record = await new Promise<CacheRecord<T> | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as CacheRecord<T> | undefined)
      request.onerror = () => reject(request.error)
    })
    database.close()
    if (!record || record.expiresAt <= Date.now()) return null
    return record.value
  } catch {
    return null
  }
}

export async function writeCachedValue<T>(key: string, value: T, expiresAt: number) {
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ key, value, expiresAt })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    database.close()
  } catch {
    // Geocoding remains available when IndexedDB is blocked or unavailable.
  }
}
