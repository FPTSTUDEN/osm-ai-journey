import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_VIEWPORT, getInitialMapViewport } from '../src/components/mapViewport'
import { deduplicatePlaces, searchLocalPlaces } from '../src/providers/localPlaceIndex'
import { weatherLabel } from '../src/providers/weather'
import type { Place } from '../src/types/domain'

const place = (id: string, name: string, category?: string): Place => ({ id, name, category, coordinates: [2.35, 48.85], source: 'map' })

test('local search ranks prefix matches and requires all terms', () => {
  const results = searchLocalPlaces([place('1', 'Central Station', 'transport'), place('2', 'Station Road', 'road'), place('3', 'Museum')], 'central station')
  assert.deepEqual(results.map((item) => item.id), ['1'])
})

test('place indexing removes duplicate feature ids', () => {
  assert.equal(deduplicatePlaces([place('same', 'One'), place('same', 'Replacement'), place('other', 'Two')]).length, 2)
})

test('initial map viewport restores free exploration and prioritizes a selected destination', () => {
  const savedViewport = { center: [-73.9857, 40.7484] as [number, number], zoom: 12.25 }
  assert.deepEqual(getInitialMapViewport(null, savedViewport), savedViewport)
  assert.deepEqual(getInitialMapViewport(null, null), DEFAULT_MAP_VIEWPORT)
  assert.deepEqual(getInitialMapViewport(place('destination', 'Destination'), savedViewport), { center: [2.35, 48.85], zoom: 14 })
})

test('weather codes map to readable condition labels', () => {
  assert.equal(weatherLabel(0), 'Clear sky')
  assert.equal(weatherLabel(61), 'Rain')
  assert.equal(weatherLabel(95), 'Thunderstorm')
})
