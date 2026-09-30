/**
 * Asset loading: one shared promise for the whole app, progress reporting, and a typed error that
 * lists exactly which keys failed so the loading screen can tell the player what to retry.
 *
 * Textures are mandatory (the challenge spec requires texture failures to be handled *before* the
 * battle starts). Sounds are best-effort: a missing sound degrades to silence and is reported as a
 * warning instead of blocking the game.
 */
import { Assets, type Spritesheet } from 'pixi.js'

import { assetsShouldFailOnce } from './debugFlags.ts'
import { atlasUrl, SOUND_KEYS, soundUrl, type AtlasKey, type SoundKey } from './manifest.ts'

export type AssetPhase = 'textures' | 'audio'

export type AssetProgress = {
  readonly phase: AssetPhase
  readonly loaded: number
  readonly total: number
}

export type AssetFailure = {
  readonly key: string
  readonly reason: string
}

export type LoadedAssets = {
  readonly atlases: Readonly<Record<AtlasKey, Spritesheet>>
  readonly sounds: Readonly<Partial<Record<SoundKey, ArrayBuffer>>>
  /** Non-fatal problems (for example a sound that could not be fetched). */
  readonly warnings: readonly AssetFailure[]
  readonly devicePixelRatio: number
}

export class AssetLoadError extends Error {
  readonly failures: readonly AssetFailure[]

  constructor(failures: readonly AssetFailure[]) {
    super(
      `Failed to load ${failures.length} asset(s): ${failures.map((failure) => failure.key).join(', ')}`,
    )
    this.name = 'AssetLoadError'
    this.failures = failures
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function resolveDevicePixelRatio(): number {
  // `?dpr=` is a debug hook (also used by the Playwright visual suite) that decides which
  // spritesheet variant is loaded, so the retina path can be exercised on a 1x display.
  const override = Number(new URLSearchParams(window.location.search).get('dpr'))
  if (Number.isFinite(override) && override > 0) return override

  const ratio = window.devicePixelRatio
  return Number.isFinite(ratio) && ratio > 1 ? ratio : 1
}

function requireAtlas(atlases: Partial<Record<AtlasKey, Spritesheet>>, key: AtlasKey): Spritesheet {
  const sheet = atlases[key]
  if (sheet === undefined)
    throw new AssetLoadError([{ key: `atlas:${key}`, reason: 'sheet missing after load' }])
  return sheet
}

const ATLAS_KEYS: AtlasKey[] = ['ships', 'tiles', 'ui']

function totalSteps(): number {
  return ATLAS_KEYS.length + SOUND_KEYS.length
}

async function loadAtlases(
  onStep: (phase: AssetPhase) => void,
  failures: AssetFailure[],
): Promise<Partial<Record<AtlasKey, Spritesheet>>> {
  const atlases: Partial<Record<AtlasKey, Spritesheet>> = {}
  const devicePixelRatio = resolveDevicePixelRatio()

  await Promise.all(
    ATLAS_KEYS.map(async (key) => {
      try {
        atlases[key] = await Assets.load<Spritesheet>(atlasUrl(key, devicePixelRatio))
      } catch (error) {
        failures.push({ key: `atlas:${key}`, reason: describe(error) })
      }
      onStep('textures')
    }),
  )

  return atlases
}

async function loadSounds(
  onStep: (phase: AssetPhase) => void,
  failures: AssetFailure[],
): Promise<Partial<Record<SoundKey, ArrayBuffer>>> {
  const sounds: Partial<Record<SoundKey, ArrayBuffer>> = {}

  await Promise.all(
    SOUND_KEYS.map(async (key) => {
      try {
        const response = await fetch(soundUrl(key))
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        sounds[key] = await response.arrayBuffer()
      } catch (error) {
        failures.push({ key: `sound:${key}`, reason: describe(error) })
      }
      onStep('audio')
    }),
  )

  return sounds
}

async function runLoad(
  onProgress: ((progress: AssetProgress) => void) | undefined,
  requireSounds: boolean,
): Promise<LoadedAssets> {
  const total = totalSteps()
  let loaded = 0
  let phase: AssetPhase = 'textures'

  const report = (): void => {
    onProgress?.({ phase, loaded, total })
  }

  report()

  if (assetsShouldFailOnce()) {
    // `?assets=missing`: behave like a request blocked by the browser and stop before the battle can
    // start. The flag is consumed, so the Retry button performs a real second attempt.
    throw new AssetLoadError([
      {
        key: 'atlas:ships',
        reason:
          'Request blocked by the browser (simulated with ?assets=missing). Press Retry to try again.',
      },
    ])
  }

  const textureFailures: AssetFailure[] = []
  const atlases = await loadAtlases((nextPhase) => {
    phase = nextPhase
    loaded += 1
    report()
  }, textureFailures)

  const soundFailures: AssetFailure[] = []
  const sounds = await loadSounds((nextPhase) => {
    phase = nextPhase
    loaded += 1
    report()
  }, soundFailures)

  if (textureFailures.length > 0) {
    throw new AssetLoadError(textureFailures)
  }

  if (requireSounds && soundFailures.length > 0) {
    throw new AssetLoadError(soundFailures)
  }

  return {
    atlases: {
      ships: requireAtlas(atlases, 'ships'),
      tiles: requireAtlas(atlases, 'tiles'),
      ui: requireAtlas(atlases, 'ui'),
    },
    sounds,
    warnings: soundFailures,
    devicePixelRatio: resolveDevicePixelRatio(),
  }
}

let pending: Promise<LoadedAssets> | undefined

/**
 * Loads every asset once and caches the result. A failed attempt is never cached, so retrying really
 * re-requests the assets (that is what the loading screen's Retry button relies on).
 */
export async function loadAssets(
  onProgress?: (progress: AssetProgress) => void,
  options?: { requireSounds?: boolean },
): Promise<LoadedAssets> {
  pending ??= runLoad(onProgress, options?.requireSounds ?? false).catch((error: unknown) => {
    pending = undefined
    throw error
  })

  return pending
}

export function resetAssetsCache(): void {
  pending = undefined
}

/** Frames available in a sheet, used by the loading screen. */
export function atlasFrameCount(sheet: Spritesheet): number {
  return Object.keys(sheet.textures).length
}
