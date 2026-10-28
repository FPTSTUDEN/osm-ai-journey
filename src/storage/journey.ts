import type { JourneyState } from '../types/domain'

const DATABASE_NAME = 'osm-ai-journey'
const JOURNEY_STORE = 'journeys'
const DATABASE_VERSION = 3

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('geocoder-results')) database.createObjectStore('geocoder-results', { keyPath: 'key' })
      if (!database.objectStoreNames.contains(JOURNEY_STORE)) database.createObjectStore(JOURNEY_STORE, { keyPath: 'id' })
      if (!database.objectStoreNames.contains('live-data')) database.createObjectStore('live-data', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadActiveJourney(): Promise<JourneyState | null> {
  try {
    const database = await openDatabase()
    const journey = await new Promise<JourneyState | undefined>((resolve, reject) => {
      const request = database.transaction(JOURNEY_STORE, 'readonly').objectStore(JOURNEY_STORE).get('active')
      request.onsuccess = () => resolve(request.result as JourneyState | undefined)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return journey ?? null
  } catch {
    return null
  }
}

export async function saveActiveJourney(journey: JourneyState) {
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(JOURNEY_STORE, 'readwrite').objectStore(JOURNEY_STORE).put(journey)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    database.close()
  } catch {
    // Journey state remains usable for this session when storage is unavailable.
  }
}

export async function deleteActiveJourney() {
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(JOURNEY_STORE, 'readwrite').objectStore(JOURNEY_STORE).delete('active')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    database.close()
  } catch {
    // Resetting the in-memory journey still works when storage is unavailable.
  }
}
