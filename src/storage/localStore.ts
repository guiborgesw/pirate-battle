/**
 * Versioned localStorage access. Every read is schema-checked by the caller and every access is
 * wrapped in try/catch, so private mode, a full quota or hand-edited values can never break the
 * game — the worst case is a fallback to defaults.
 *
 * Keys follow `pb.<name>.v1`; bumping the suffix retires old data instead of migrating it.
 */

export type StorageKey = 'options' | 'lastResult' | 'audio' | 'playerId' | 'pending' | 'mockDb'

export const STORAGE_KEYS: Record<StorageKey, string> = {
  options: 'pb.options.v1',
  lastResult: 'pb.lastResult.v1',
  audio: 'pb.audio.v1',
  playerId: 'pb.playerId.v1',
  pending: 'pb.pending.v1',
  mockDb: 'pb.mockdb.v1',
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type ReadResult =
  | { readonly found: true; readonly value: unknown }
  | { readonly found: false; readonly reason: 'missing' | 'corrupt' | 'unavailable' }

let injected: StorageLike | undefined

/** Test seam: inject a fake backend (see `scripts/self-check.ts`). */
export function configureStorage(backend: StorageLike): void {
  injected = backend
}

export function resetStorageBackend(): void {
  injected = undefined
}

/** Last-resort backend used when localStorage is missing or throws (Node, private mode). */
const memory = new Map<string, string>()

const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
  removeItem: (key) => {
    memory.delete(key)
  },
}

function resolveBackend(): StorageLike {
  if (injected !== undefined) return injected

  try {
    const candidate: unknown = Reflect.get(globalThis, 'localStorage')
    if (typeof candidate === 'object' && candidate !== null) {
      const probe = candidate as Partial<StorageLike>
      if (
        typeof probe.getItem === 'function' &&
        typeof probe.setItem === 'function' &&
        typeof probe.removeItem === 'function'
      ) {
        return probe as StorageLike
      }
    }
  } catch {
    // Accessing localStorage can throw in sandboxed frames; the in-memory backend covers it.
  }

  return memoryStorage
}

export function storageKey(key: StorageKey): string {
  return STORAGE_KEYS[key]
}

export function readJson(key: StorageKey): ReadResult {
  let raw: string | null

  try {
    raw = resolveBackend().getItem(STORAGE_KEYS[key])
  } catch {
    return { found: false, reason: 'unavailable' }
  }

  if (raw === null || raw === '') {
    return { found: false, reason: 'missing' }
  }

  try {
    const value: unknown = JSON.parse(raw)
    return { found: true, value }
  } catch {
    return { found: false, reason: 'corrupt' }
  }
}

export function writeJson(key: StorageKey, value: unknown): boolean {
  try {
    resolveBackend().setItem(STORAGE_KEYS[key], JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStored(key: StorageKey): void {
  try {
    resolveBackend().removeItem(STORAGE_KEYS[key])
  } catch {
    // Nothing to do: failing to remove a key must never break a flow.
  }
}
