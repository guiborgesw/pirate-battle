/**
 * Tile ids of `tiles_sheet.png` (frames are named `tile_r<row>c<col>` by the converter).
 *
 * Measured, not guessed: every entry below was derived by decoding the sheet and classifying each
 * 64px tile by its mean colour and alpha coverage (`pnpm assets:inspect tiles`), then confirmed
 * against the shipped mockups. The 0-based grid index of a tile is `row * 16 + column`.
 */
import type { Circle } from './gameConfig.ts'

export type TileId = string

/** The only water tile in the sheet: index 72, rgb(69, 204, 230) with diagonal wave streaks. */
export const WATER_TILE: TileId = 'tile_r4c8'

/** Grey fortress pieces (walls, towers, walkways) — decoration for island interiors. */
export const FORTRESS_TILES = {
  tower: 'tile_r1c9',
  towerSmall: 'tile_r2c10',
  wall: 'tile_r5c8',
  walkway: 'tile_r0c12',
  gate: 'tile_r5c10',
  platform: 'tile_r0c9',
} as const satisfies Record<string, TileId>

export type TileBlob = {
  /** Beach/sand body drawn under the island. */
  readonly sand: readonly TileId[]
  /** Grass patch drawn on top of the sand. */
  readonly grass: readonly TileId[]
  /** Rock and foliage decorations that make the island read as land. */
  readonly props: readonly TileId[]
}

/**
 * Complete 3x3 sand blob (tiles 0-8 of the sheet) with the matching grass block (22, 23, 38, 39)
 * and props measured on the mockups.
 */
export const ISLAND_BLOBS: readonly TileBlob[] = [
  {
    sand: [
      'tile_r0c0',
      'tile_r0c1',
      'tile_r0c2',
      'tile_r1c0',
      'tile_r1c1',
      'tile_r1c2',
      'tile_r2c0',
      'tile_r2c1',
      'tile_r2c2',
    ],
    grass: ['tile_r1c6', 'tile_r1c7', 'tile_r2c6', 'tile_r2c7'],
    props: ['tile_r4c5', 'tile_r4c6', 'tile_r4c7', 'tile_r3c0', 'tile_r3c1'],
  },
  {
    sand: [
      'tile_r0c3',
      'tile_r0c4',
      'tile_r0c5',
      'tile_r1c3',
      'tile_r1c4',
      'tile_r1c5',
      'tile_r2c3',
      'tile_r2c4',
      'tile_r2c5',
    ],
    grass: ['tile_r1c6', 'tile_r2c6', 'tile_r1c7', 'tile_r2c7'],
    props: ['tile_r4c5', 'tile_r4c6', 'tile_r3c0'],
  },
  {
    sand: [
      'tile_r2c0',
      'tile_r2c1',
      'tile_r2c2',
      'tile_r3c0',
      'tile_r3c1',
      'tile_r3c2',
      'tile_r4c0',
      'tile_r4c1',
      'tile_r4c2',
    ],
    grass: ['tile_r1c6', 'tile_r1c7', 'tile_r2c6', 'tile_r2c7'],
    props: ['tile_r4c5', 'tile_r4c6', 'tile_r4c7', 'tile_r3c0', 'tile_r3c1'],
  },
]

/** Islands are circles for collision and blobs for rendering; the blob is picked by `variant`. */
export function islandBlob(variant: number): TileBlob {
  const blob = ISLAND_BLOBS[variant % ISLAND_BLOBS.length]
  // ISLAND_BLOBS is non-empty, so the modulo result always resolves to a defined entry.
  if (blob === undefined) throw new Error(`no tile blob for variant ${variant}`)
  return blob
}

/** Tile rectangles are 64px in logical units; helpers below keep the renderer free of literals. */
export const TILE_SIZE_PX = 64

export function circlesBounds(circles: readonly Circle[]): {
  left: number
  top: number
  right: number
  bottom: number
} {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const circle of circles) {
    left = Math.min(left, circle.x - circle.radius)
    top = Math.min(top, circle.y - circle.radius)
    right = Math.max(right, circle.x + circle.radius)
    bottom = Math.max(bottom, circle.y + circle.radius)
  }

  return { left, top, right, bottom }
}
