const DATABASE_NAME = 'osm-ai-journey'
const DATABASE_VERSION = 4

let databasePromise: Promise<IDBDatabase> | null = null

export function getDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  const pendingDatabase = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('geocoder-results')) database.createObjectStore('geocoder-results', { keyPath: 'key' })
      if (!database.objectStoreNames.contains('journeys')) database.createObjectStore('journeys', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('live-data')) database.createObjectStore('live-data', { keyPath: 'key' })
      if (!database.objectStoreNames.contains('companion-art')) database.createObjectStore('companion-art', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        if (databasePromise === pendingDatabase) databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })

  databasePromise = pendingDatabase
  void pendingDatabase.catch(() => {
    if (databasePromise === pendingDatabase) databasePromise = null
  })
  return pendingDatabase
}

export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await getDb()
  return new Promise((resolve, reject) => {
    const request = database.transaction(store, 'readonly').objectStore(store).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error ?? new Error(`Unable to read IndexedDB store "${store}"`))
  })
}

export async function put(store: string, value: unknown): Promise<void> {
  const database = await getDb()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(store, 'readwrite').objectStore(store).put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(`Unable to write IndexedDB store "${store}"`))
  })
}

export async function remove(store: string, key: IDBValidKey): Promise<void> {
  const database = await getDb()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(store, 'readwrite').objectStore(store).delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete from IndexedDB store "${store}"`))
  })
}
