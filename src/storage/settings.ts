/**
 * Persisted player settings. Values are validated on the way out: a corrupt entry falls back to
 * the defaults instead of surfacing an error, because the player cannot fix broken storage.
 */
import { DEFAULT_OPTIONS, parseStoredOptions, type GameOptions } from '../config/optionsSchema.ts'
import { readJson, writeJson } from './localStore.ts'

export function loadOptions(): GameOptions {
  const stored = readJson('options')
  if (!stored.found) return DEFAULT_OPTIONS

  return parseStoredOptions(stored.value) ?? DEFAULT_OPTIONS
}

export function saveOptions(options: GameOptions): boolean {
  return writeJson('options', options)
}
