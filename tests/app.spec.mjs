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

async function chooseOnlinePlace(page) {
  const search = page.getByPlaceholder('Search loaded places')
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

test('completes and restores an online destination journey', async ({ page }) => {
  test.setTimeout(60000)
  await mockSearch(page)
  await resetBrowser(page)
  await chooseOnlinePlace(page)
  await expect(page.getByRole('complementary', { name: 'Selected destination' }).getByRole('heading', { name: 'Test Destination' })).toBeVisible()
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
  await expect(page.getByRole('complementary', { name: 'Selected destination' }).getByRole('heading', { name: 'Test Destination' })).toBeVisible()
  await expect(page.getByText(/1 destination/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__restoredMapMarkerOffset), { timeout: 15000 }).not.toBeNull()
  expect(await page.evaluate(() => window.__restoredMapMarkerOffset)).toBeLessThan(30)
})

test('restores the last explored map viewport when no destination is selected', async ({ page }) => {
  test.setTimeout(60000)
  await resetBrowser(page)
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
  await expect(page.locator('.map-canvas canvas')).toBeVisible({ timeout: 15000 })
  await expect.poll(async () => {
    const viewport = await readActiveMapViewport(page)
    if (!viewport) return Number.POSITIVE_INFINITY
    const centerDifference = Math.hypot(
      viewport.center[0] - savedViewport.center[0],
      viewport.center[1] - savedViewport.center[1],
    )
    return Math.max(centerDifference, Math.abs(viewport.zoom - savedViewport.zoom))
  }, { timeout: 15000 }).toBeLessThan(0.0001)
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
  const people = page.getByPlaceholder('Add user-created people')
  await people.fill('Ada')
  await people.press('Enter')
  await expect(page.getByText('Ada', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle settings' })).toHaveAttribute('aria-label', 'Toggle settings')
})

test('does not overflow a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await resetBrowser(page)
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
})
