import type { JourneyState } from '../types/domain'
import { get, put, remove } from './db'
import { normalizeMessages } from './messages'

const JOURNEY_STORE = 'journeys'

export async function loadActiveJourney(): Promise<JourneyState | null> {
  try {
    const journey = await get<Omit<JourneyState, 'messages'> & { messages: unknown }>(JOURNEY_STORE, 'active')
    if (!journey) return null
    // Journeys saved before structured messages stored string[]; migrate on read.
    return { ...journey, messages: normalizeMessages(journey.messages) ?? [] }
  } catch {
    return null
  }
}

export async function saveActiveJourney(journey: JourneyState) {
  try {
    await put(JOURNEY_STORE, journey)
  } catch {
    // Journey state remains usable for this session when storage is unavailable.
  }
}

export async function deleteActiveJourney() {
  try {
    await remove(JOURNEY_STORE, 'active')
  } catch {
    // Resetting the in-memory journey still works when storage is unavailable.
  }
}
