import { expect, test } from '@playwright/test'

const place = { osm_type: 'node', osm_id: 314, name: 'Test Destination', display_name: 'Test Destination, Test City', type: 'museum', lat: '35.6762', lon: '139.6503' }

async function resetBrowser(page) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('osm-ai-journey') })
  await page.reload()
}

async function mockSearch(page) {
  await page.route('https://nominatim.openstreetmap.org/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([place]) }))
}

async function mockPhotos(page) {
  await page.route('https://commons.wikimedia.org/w/api.php**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: { '123': {
      pageid: 123,
      title: 'File:Test scene.jpg',
      imageinfo: [{
        thumburl: 'https://images.test/thumb/1600px-Test_scene.jpg',
        url: 'https://images.test/full.jpg',
        mime: 'image/jpeg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test_scene.jpg',
        extmetadata: { ImageDescription: { value: 'Test scene description' } },
      }],
      coordinates: [{ lat: 35.6762, lon: 139.6503 }],
    } } } }),
  }))
}

async function chooseOnlinePlace(page) {
  await page.locator('.story-dock button').nth(0).click()
  const search = page.getByPlaceholder('Search places')
  await search.fill('test destination')
  await page.getByRole('button', { name: 'Search online' }).click()
  await page.getByRole('button', { name: /Test Destination/ }).click()
}

async function readActiveMapViewport(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('osm-ai-journey')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const getJourney = database.transaction('journeys', 'readonly').objectStore('journeys').get('active')
      getJourney.onsuccess = () => {
        database.close()
        resolve(getJourney.result?.mapViewport ?? null)
      }
      getJourney.onerror = () => {
        database.close()
        reject(getJourney.error)
      }
    }
  }))
}

test('upgrades a v3 journey database without losing its stores or records', async ({ page }) => {
  await page.route('**/database-migration-fixture', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))
  await page.goto('/database-migration-fixture')
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('osm-ai-journey', 3)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('geocoder-results', { keyPath: 'key' })
      database.createObjectStore('journeys', { keyPath: 'id' })
      database.createObjectStore('live-data', { keyPath: 'key' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('journeys', 'readwrite')
      transaction.objectStore('journeys').put({
        id: 'active',
        currentDestination: null,
        mapViewport: null,
        destinationHistory: [],
        currentScene: 3,
        messages: ['A saved traveler message'],
        knownPeople: [],
        knownEntities: [],
        userFacts: [],
        narrativeEvents: [],
      })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Osm AI Journey' })).toBeVisible()
  const upgraded = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('osm-ai-journey')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('journeys', 'readonly')
      const getJourney = transaction.objectStore('journeys').get('active')
      getJourney.onsuccess = () => {
        const result = {
          version: database.version,
          stores: Array.from(database.objectStoreNames),
          journey: getJourney.result,
        }
        database.close()
        resolve(result)
      }
      getJourney.onerror = () => reject(getJourney.error)
    }
  }))
  expect(upgraded.version).toBe(4)
  expect(upgraded.stores).toEqual(expect.arrayContaining(['geocoder-results', 'journeys', 'live-data', 'companion-art']))
  expect(upgraded.journey.currentScene).toBe(3)
  expect(upgraded.journey.messages).toEqual(['A saved traveler message'])
})

test('field notes reuse the full place details view', async ({ page }) => {
  await mockSearch(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  await page.locator('.story-dock button').nth(1).click()
  await page.getByRole('button', { name: 'Open field notes' }).click()
  const fieldNotes = page.locator('.field-notes')
  await expect(fieldNotes.locator('.place-facts')).toBeVisible()
  await expect(fieldNotes.locator('.weather-panel')).toHaveCount(2)
  await expect(fieldNotes.locator('.place-photos')).toBeVisible()
})

test('opening hours and nearby stops are requested only after the user asks', async ({ page }) => {
  let overpassRequests = 0
  await mockSearch(page)
  await page.route('https://overpass-api.de/api/interpreter', async (route) => {
    overpassRequests += 1
    expect(route.request().method()).toBe('POST')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ elements: [
        { type: 'node', lat: 35.6763, lon: 139.6503, tags: { name: 'Museum Stop', highway: 'bus_stop' } },
        { type: 'node', lat: 35.6762, lon: 139.6503, tags: { name: 'Test Destination', opening_hours: 'Mo-Su 09:00-17:00' } },
      ] }),
    })
  })
  await resetBrowser(page)
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  await page.getByLabel('Enable optional live data').check()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await chooseOnlinePlace(page)
  await page.locator('.story-dock button').nth(1).click()
  await page.getByRole('button', { name: 'Open field notes' }).click()
  expect(overpassRequests).toBe(0)
  await page.getByRole('button', { name: 'Check hours & nearby stops' }).click()
  const fieldNotes = page.locator('.field-notes')
  await expect(fieldNotes.getByText('Mo-Su 09:00-17:00')).toBeVisible()
  await expect(fieldNotes.getByText('Museum Stop · bus stop')).toBeVisible()
  expect(overpassRequests).toBe(1)
})

test('a local PMTiles picker rejects files without a pmtiles extension', async ({ page }) => {
  await resetBrowser(page)
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  const archiveInput = page.getByLabel('Choose a .pmtiles archive')
  await archiveInput.setInputFiles({
    name: 'not-a-map.txt',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a PMTiles archive'),
  })
  await expect(page.getByRole('alert')).toContainText('Choose a file with the .pmtiles extension')
  await archiveInput.setInputFiles({
    name: 'broken.pmtiles',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('invalid archive contents'),
  })
  await expect(page.getByRole('alert')).not.toBeEmpty()
})

test('offline cache status ignores unrelated origin caches and clearing leaves them intact', async ({ page }) => {
  await resetBrowser(page)
  await page.evaluate(() => caches.open('unrelated-cache'))
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  await page.getByRole('button', { name: 'Refresh status' }).click()
  await expect(page.locator('.offline-cache').first()).toContainText('0 cached resources across 0 caches')
  await page.getByRole('button', { name: 'Clear cache' }).click()
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain('unrelated-cache')
})

test('completes and restores an online destination journey', async ({ page }) => {
  test.setTimeout(60000)
  await mockSearch(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  await page.locator('.story-dock button').nth(1).click()
  await expect(page.getByRole('complementary', { name: 'Destination panel' }).getByRole('heading', { name: 'Test Destination' })).toBeVisible()
  await expect.poll(() => page.locator('.map-canvas').evaluate((map) => {
    const marker = map.querySelector('.maplibregl-marker')
    if (!marker) return Number.POSITIVE_INFINITY
    const mapBounds = map.getBoundingClientRect()
    const markerBounds = marker.getBoundingClientRect()
    return Math.hypot(
      markerBounds.left + markerBounds.width / 2 - (mapBounds.left + mapBounds.width / 2),
      markerBounds.top + markerBounds.height / 2 - (mapBounds.top + mapBounds.height / 2),
    )
  }), { timeout: 15000 }).toBeLessThan(30)
  await page.addInitScript(() => {
    window.__restoredMapMarkerOffset = null
    const captureInitialMarkerPosition = () => {
      const map = document.querySelector('.map-canvas')
      const marker = map?.querySelector('.maplibregl-marker')
      if (map && marker) {
        const mapBounds = map.getBoundingClientRect()
        const markerBounds = marker.getBoundingClientRect()
        window.__restoredMapMarkerOffset = Math.hypot(
          markerBounds.left + markerBounds.width / 2 - (mapBounds.left + mapBounds.width / 2),
          markerBounds.top + markerBounds.height / 2 - (mapBounds.top + mapBounds.height / 2),
        )
        return
      }
      requestAnimationFrame(captureInitialMarkerPosition)
    }
    requestAnimationFrame(captureInitialMarkerPosition)
  })
  await page.reload()
  await page.locator('.story-dock button').nth(0).click()
  await expect(page.locator('.map-canvas canvas')).toBeVisible({ timeout: 15000 })
  await page.locator('.story-dock button').nth(1).click()
  await expect(page.getByRole('complementary', { name: 'Destination panel' }).getByRole('heading', { name: 'Test Destination' })).toBeVisible()
  await expect(page.getByText(/1 destination/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__restoredMapMarkerOffset), { timeout: 15000 }).not.toBeNull()
  expect(await page.evaluate(() => window.__restoredMapMarkerOffset)).toBeLessThan(30)
})

test('restores the last explored map viewport when no destination is selected', async ({ page }) => {
  test.setTimeout(60000)
  await resetBrowser(page)
  await page.locator('.story-dock button').nth(0).click()
  const map = page.locator('.map-canvas')
  await expect(map.locator('canvas')).toBeVisible({ timeout: 15000 })
  const bounds = await map.boundingBox()
  expect(bounds).not.toBeNull()
  const startX = bounds.x + bounds.width / 2
  const startY = bounds.y + bounds.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 120, startY + 70, { steps: 6 })
  await page.mouse.up()

  await expect.poll(async () => {
    const viewport = await readActiveMapViewport(page)
    if (!viewport) return 0
    return Math.hypot(viewport.center[0] - 2.3522, viewport.center[1] - 48.8566)
  }, { timeout: 15000 }).toBeGreaterThan(0.01)
  const savedViewport = await readActiveMapViewport(page)
  expect(savedViewport).not.toBeNull()

  await page.reload()
  await page.locator('.story-dock button').nth(0).click()
  await expect(page.locator('.map-canvas canvas')).toBeVisible({ timeout: 15000 })
  await expect.poll(async () => {
    const viewport = await readActiveMapViewport(page)
    if (!viewport) return Number.POSITIVE_INFINITY
    const centerDifference = Math.hypot(
      viewport.center[0] - savedViewport.center[0],
      viewport.center[1] - savedViewport.center[1],
    )
    return Math.max(centerDifference, Math.abs(viewport.zoom - savedViewport.zoom))
  }, { timeout: 15000 }).toBeLessThan(0.001)
})

test('shows a provider failure without breaking normal chat UI', async ({ page }) => {
  await page.route('http://localhost:11434/v1/chat/completions', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Local model is offline' } }) }))
  await resetBrowser(page)
  const composer = page.getByPlaceholder(/Speak freely/)
  await composer.fill('Hello without a destination')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Provider error: Local model is offline')).toBeVisible()
  await expect(composer).toBeVisible()
})

test('supports keyboard journey memory and accessible controls', async ({ page }) => {
  await resetBrowser(page)
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Journey settings' })).toBeVisible()
  const people = page.getByPlaceholder('Add user-created people')
  await people.fill('Ada')
  await people.press('Enter')
  await expect(page.getByText('Ada', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle settings' })).toHaveAttribute('aria-label', 'Toggle settings')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Journey settings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Toggle settings' })).toBeFocused()
})

test('does not overflow a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await resetBrowser(page)
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
})

test('opening hero, dialogue, and mobile dock do not overlap', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await resetBrowser(page)
    const layout = await page.evaluate(() => {
      const opening = document.querySelector('.opening-screen').getBoundingClientRect()
      const dialogue = document.querySelector('.dialogue-panel').getBoundingClientRect()
      const dock = document.querySelector('.story-dock').getBoundingClientRect()
      return { heroDialogueGap: dialogue.top - opening.bottom, dialogueDockGap: dock.top - dialogue.bottom }
    })
    expect(layout.heroDialogueGap).toBeGreaterThanOrEqual(0)
    if (viewport.width <= 520) expect(layout.dialogueDockGap).toBeGreaterThanOrEqual(0)
  }
})

test('story panels open independently and ignore keyboard focus changes', async ({ page }) => {
  await resetBrowser(page)
  const dockButtons = page.locator('.story-dock button')
  const mapToggle = dockButtons.nth(0)
  const placeToggle = dockButtons.nth(1)
  const journalToggle = dockButtons.nth(2)
  const composer = page.getByPlaceholder(/Speak freely/)
  await expect(page.locator('.conversation')).toHaveCSS('pointer-events', 'auto')
  await expect(page.locator('.conversation')).toHaveCSS('overflow-y', 'auto')

  await composer.focus()
  await expect(mapToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.map-panel')).toHaveCount(0)
  await expect(page.locator('.map-canvas')).toHaveCount(0)

  await mapToggle.click()
  await expect(mapToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('complementary', { name: 'Map navigation panel' })).toBeVisible()
  await expect(page.locator('.map-canvas')).toBeVisible()
  const compactMapWidth = await page.locator('.map-panel').evaluate((map) => map.getBoundingClientRect().width)
  await composer.fill('Focus should not change the map layout')
  expect(await page.locator('.map-panel').evaluate((map) => map.getBoundingClientRect().width)).toBe(compactMapWidth)

  await expect(placeToggle).toBeDisabled()
  await expect(page.getByRole('complementary', { name: 'Destination panel' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Map navigation panel' })).toBeVisible()

  await mapToggle.click()
  await expect(mapToggle).toHaveAttribute('aria-pressed', 'false')
  await journalToggle.click()
  await expect(page.getByRole('complementary', { name: 'Journal panel' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Journal panel' })).toHaveCount(0)
  await expect(journalToggle).toBeFocused()
})

test('opening screen makes no provider request until an explicit shortcut is selected', async ({ page }) => {
  const providerRequests = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1') && !request.url().startsWith('http://localhost')) providerRequests.push(request.url())
  })
  await mockSearch(page)
  await resetBrowser(page)
  await expect(page.getByRole('heading', { name: 'Every place on Earth is a doorway into a story.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show companion' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.story-dock button').nth(1)).toBeDisabled()
  expect(providerRequests).toEqual([])

  await page.getByRole('button', { name: 'Trevi Fountain' }).click()
  await expect.poll(() => providerRequests.some((url) => url.includes('nominatim.openstreetmap.org/search'))).toBe(true)
  await expect(page.getByRole('status')).toContainText('You arrive at Test Destination')
})

test('Retry resends the last user turn after a provider failure', async ({ page }) => {
  let requests = 0
  await page.route('http://localhost:11434/v1/chat/completions', (route) => {
    requests += 1
    if (requests === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary failure' } }) })
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"The retry worked."}}]}\n\ndata: [DONE]\n\n',
    })
  })
  await resetBrowser(page)
  await page.getByPlaceholder(/Speak freely/).fill('Please retry me')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('The retry worked.')).toBeVisible()
  expect(requests).toBe(2)
})

test('Stop cancels a slow response and returns the composer to idle', async ({ page }) => {
  await page.route('http://localhost:11434/v1/chat/completions', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    try {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Late reply."}}]}\n\ndata: [DONE]\n\n' })
    } catch {
      // The test intentionally aborts this request before its delayed response.
    }
  })
  await resetBrowser(page)
  await page.getByPlaceholder(/Speak freely/).fill('Stop this response')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
})

test('Log expands and reduced motion displays streamed text immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('http://localhost:11434/v1/chat/completions', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"choices":[{"delta":{"content":"An entire line appears."}}]}\n\ndata: [DONE]\n\n',
  }))
  await resetBrowser(page)
  await page.getByPlaceholder(/Speak freely/).fill('Ask for a line')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.locator('.conversation')).toContainText('An entire line appears.')
  await expect(page.locator('.conversation .message')).toHaveCount(1)
  await page.getByRole('button', { name: 'Log' }).click()
  await expect(page.locator('.conversation')).toContainText('Choose a place on the map')
  await expect(page.locator('.conversation')).toContainText('Ask for a line')
  await page.getByRole('button', { name: 'Close log' }).click()
  await expect(page.locator('.conversation .message')).toHaveCount(1)
})

test('uploaded companion illustration persists as browser-local data', async ({ page }) => {
  await resetBrowser(page)
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  await page.getByLabel('Companion illustration').setInputFiles({
    name: 'companion.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  })
  await expect(page.getByRole('button', { name: 'Remove illustration' })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle settings' }).click()
  await page.getByRole('button', { name: 'Show companion' }).click()
  await expect(page.getByRole('img', { name: 'Companion illustration' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Show companion' }).click()
  await expect(page.getByRole('img', { name: 'Companion illustration' })).toBeVisible()
})

test('dialogue box does not overlap open panels at desktop, tablet, or mobile widths', async ({ page }) => {
  await mockSearch(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  const dockButtons = page.locator('.story-dock button')
  await dockButtons.nth(1).click()

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1100, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const dialogue = await page.locator('.dialogue-panel').boundingBox()
    const panels = [
      await page.locator('.map-panel').boundingBox(),
      await page.getByRole('complementary', { name: 'Destination panel' }).boundingBox(),
    ].filter(Boolean)
    expect(dialogue).not.toBeNull()
    expect(panels).toHaveLength(2)
    for (const panel of panels) {
      const overlaps = dialogue.x < panel.x + panel.width && dialogue.x + dialogue.width > panel.x && dialogue.y < panel.y + panel.height && dialogue.y + dialogue.height > panel.y
      expect(overlaps, `dialogue overlaps a panel at ${viewport.width}px`).toBe(false)
    }
  }
})

test('Explore opens the map panel without putting the map behind the scene', async ({ page }) => {
  await resetBrowser(page)
  const modeToggle = page.getByRole('button', { name: 'Story' })

  await modeToggle.click()
  await expect(page.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.map-panel')).toHaveClass(/map-panel--compact/)
  await expect(page.locator('.map-canvas')).toBeVisible()
  await expect(page.locator('.journey-panel')).toBeHidden()

  await page.getByRole('button', { name: 'Explore' }).click()
  await expect(page.locator('.map-canvas')).toHaveCount(0)
  await expect(page.locator('.map-panel')).toHaveCount(0)
})

test('selected photo replaces the ambient background while the map stays panel-only', async ({ page }) => {
  await mockSearch(page)
  await mockPhotos(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  await page.locator('.story-dock button').nth(0).click()
  await page.locator('.story-dock button').nth(1).click()
  const photoChoice = page.getByRole('button', { name: /Test scene\.jpg/ })
  await expect(photoChoice).toBeVisible()
  await expect(page.locator('.scene-art')).toHaveCount(0)
  await expect(page.locator('.map-canvas')).toHaveCount(0)
  await photoChoice.click()

  const sceneArt = page.locator('.scene-art')
  await expect(sceneArt).toBeVisible()
  await expect(sceneArt.locator('img')).toHaveAttribute('src', 'https://images.test/thumb/1600px-Test_scene.jpg')
  await expect(sceneArt).toHaveCount(1)
  await expect(page.locator('.map-canvas')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Photo source' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Test_scene.jpg')

  await page.locator('.story-dock button').nth(0).click()
  await expect(page.locator('.map-canvas')).toBeVisible()
  await expect(sceneArt).toBeVisible()
})

test('map and destination panels remain usable together on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSearch(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  const dockButtons = page.locator('.story-dock button')
  await dockButtons.nth(1).click()

  const mapBounds = await page.locator('.map-panel').boundingBox()
  const placeBounds = await page.getByRole('complementary', { name: 'Destination panel' }).boundingBox()
  expect(mapBounds).not.toBeNull()
  expect(placeBounds).not.toBeNull()
  expect(placeBounds.y).toBeGreaterThanOrEqual(mapBounds.y + mapBounds.height)
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
})
