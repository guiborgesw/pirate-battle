/**
 * The player's audio preference, kept apart from the gameplay options on purpose: the spec's Options
 * screen is about the two session parameters, while mute is a device setting for this browser.
 */
import { readJson, removeStored, writeJson } from './localStore.ts'

export type AudioSettings = {
  readonly muted: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false }

export function parseAudioSettings(input: unknown): AudioSettings | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const muted = (input as Record<string, unknown>).muted
  if (typeof muted !== 'boolean') return undefined
  return { muted }
}

export function loadAudioSettings(): AudioSettings {
  const stored = readJson('audio')
  if (!stored.found) return DEFAULT_AUDIO_SETTINGS
  return parseAudioSettings(stored.value) ?? DEFAULT_AUDIO_SETTINGS
}

export function saveAudioSettings(settings: AudioSettings): boolean {
  return writeJson('audio', settings)
}

export function clearAudioSettings(): void {
  removeStored('audio')
}
