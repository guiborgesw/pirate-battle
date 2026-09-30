/**
 * The single source of truth for where assets live. Textures are loaded through Pixi's `Assets`
 * (spritesheet JSON, parsed and cached by Pixi); sounds are fetched as raw buffers so the audio
 * layer (M10) can decode them lazily on first use.
 *
 * High-DPR screens use the retina sheets where they are real 2x assets — the tiles and UI sheets
 * are, the ships sheet is not (see docs/assets-reference.md).
 */

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`

export type AtlasKey = 'ships' | 'tiles' | 'ui'

export type AtlasEntry = {
  readonly json: string
  readonly retinaJson?: string
  /** Frames expected in the sheet — used by the loading screen and the self-check. */
  readonly frames: number
}

export const ATLASES: Record<AtlasKey, AtlasEntry> = {
  ships: {
    json: `${ASSET_BASE}spritesheet/ships_miscellaneous_sheet.json`,
    frames: 102,
  },
  tiles: {
    json: `${ASSET_BASE}tilesheet/tiles_sheet.json`,
    retinaJson: `${ASSET_BASE}tilesheet/tiles_sheet_retina.json`,
    frames: 96,
  },
  ui: {
    json: `${ASSET_BASE}spritesheet/ui_sheet.json`,
    retinaJson: `${ASSET_BASE}spritesheet/ui_sheet_retina.json`,
    frames: 36,
  },
}

export const SOUND_KEYS = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'health_low',
  'ocean_ambience_loop',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sailing_loop',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
  'ui_back',
  'ui_click',
  'ui_close',
  'ui_hover',
  'ui_open',
] as const

export type SoundKey = (typeof SOUND_KEYS)[number]

export function soundUrl(key: SoundKey): string {
  return `${ASSET_BASE}sounds/${key}.wav`
}

/** Picks the retina spritesheet when the screen can actually use it. */
export function atlasUrl(key: AtlasKey, devicePixelRatio: number): string {
  const entry = ATLASES[key]
  if (devicePixelRatio > 1.5 && entry.retinaJson !== undefined) return entry.retinaJson
  return entry.json
}
