export type OfflineCacheStatus = {
  cacheNames: string[]
  entries: number
}

export async function getOfflineCacheStatus(): Promise<OfflineCacheStatus> {
  if (!('caches' in window)) return { cacheNames: [], entries: 0 }
  const cacheNames = await caches.keys()
  const counts = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).matchAll().then((requests) => requests.length)))
  return { cacheNames, entries: counts.reduce((total, count) => total + count, 0) }
}

export async function clearOfflineCache() {
  if (!('caches' in window)) return
  await Promise.all((await caches.keys()).filter((name) => name.startsWith('osm-ai-journey-')).map((name) => caches.delete(name)))
  const registration = await navigator.serviceWorker?.getRegistration()
  registration?.active?.postMessage({ type: 'PRECACHE_SHELL' })
}
