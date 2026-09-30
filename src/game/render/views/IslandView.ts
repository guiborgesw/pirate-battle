/**
 * Islands. Every island is a set of collision circles (config) plus a visual built from the
 * tileset: a 3x3 sand blob, a grass patch and a deterministic scatter of rocks/foliage.
 *
 * The tile ids come from `src/config/tileMap.ts`, which was measured from the sheet — the sheet has
 * exactly one water tile and no island-sized tile, so islands are composed.
 */
import { Container, Sprite, type Spritesheet } from 'pixi.js'

import type { IslandDefinition } from '../../../config/gameConfig.ts'
import { circlesBounds, islandBlob, TILE_SIZE_PX } from '../../../config/tileMap.ts'
import { createRng } from '../../core/Rng.ts'
import { textureOrThrow } from '../textures.ts'

export type IslandView = {
  readonly container: Container
  destroy(): void
}

/** Scatter positions for the props, in units of the island's radius. */
const PROP_SCATTER = [
  { x: -0.42, y: -0.18 },
  { x: 0.32, y: -0.36 },
  { x: 0.46, y: 0.22 },
  { x: -0.24, y: 0.44 },
  { x: 0.05, y: 0.1 },
] as const

const BLOB_COLUMNS = 3
const GRASS_COLUMNS = 2
/** The sand blob spans 3 tiles; the grass patch is smaller so the beach stays visible. */
const BLOB_TILES = 3
const GRASS_SCALE_RATIO = 0.62
/** Islands look best when the blob overhangs the collision circles slightly. */
const BLOB_COVERAGE = 2.2

function placeGrid(options: {
  container: Container
  tiles: Spritesheet
  frames: readonly string[]
  columns: number
  scale: number
  originX: number
  originY: number
}): void {
  const step = TILE_SIZE_PX * options.scale

  options.frames.forEach((frame, index) => {
    const column = index % options.columns
    const row = Math.floor(index / options.columns)

    const sprite = new Sprite({ texture: textureOrThrow(options.tiles, frame) })
    sprite.anchor.set(0, 0)
    sprite.scale.set(options.scale)
    sprite.position.set(options.originX + column * step, options.originY + row * step)
    options.container.addChild(sprite)
  })
}

export function createIslandView(options: {
  island: IslandDefinition
  tiles: Spritesheet
}): IslandView {
  const { island, tiles } = options
  const container = new Container()
  const blob = islandBlob(island.variant)

  const bounds = circlesBounds(island.circles)
  const centreX = (bounds.left + bounds.right) / 2
  const centreY = (bounds.top + bounds.bottom) / 2
  const mainCircle = island.circles.reduce((largest, circle) =>
    circle.radius > largest.radius ? circle : largest,
  )

  container.x = centreX
  container.y = centreY

  const blobSize = TILE_SIZE_PX * BLOB_TILES

  // One blob per collision circle: the overlapping rounded blobs form an organic island whose shape
  // is exactly the shape ships and projectiles collide with.
  for (const circle of island.circles) {
    const scale = (circle.radius * BLOB_COVERAGE) / blobSize
    const origin = -(blobSize * scale) / 2

    placeGrid({
      container,
      tiles,
      frames: blob.sand,
      columns: BLOB_COLUMNS,
      scale,
      originX: circle.x - centreX + origin,
      originY: circle.y - centreY + origin,
    })
  }

  const grassScale = ((mainCircle.radius * BLOB_COVERAGE) / blobSize) * GRASS_SCALE_RATIO
  const grassSize = TILE_SIZE_PX * GRASS_COLUMNS * grassScale
  placeGrid({
    container,
    tiles,
    frames: blob.grass,
    columns: GRASS_COLUMNS,
    scale: grassScale,
    originX: mainCircle.x - centreX - grassSize / 2,
    originY: mainCircle.y - centreY - grassSize / 2,
  })

  // Deterministic per island: same variant and shape always scatters the same way.
  const rng = createRng(island.variant * 7919 + island.circles.length)

  PROP_SCATTER.forEach((offset, index) => {
    const frame = blob.props[index % blob.props.length]
    if (frame === undefined) return

    const sprite = new Sprite({ texture: textureOrThrow(tiles, frame) })
    sprite.anchor.set(0.5, 0.5)
    sprite.scale.set(grassScale * rng.nextFloat(0.7, 1.1))
    sprite.position.set(
      mainCircle.x - centreX + offset.x * mainCircle.radius,
      mainCircle.y - centreY + offset.y * mainCircle.radius,
    )
    container.addChild(sprite)
  })

  return {
    container,
    destroy(): void {
      container.removeChildren()
      container.destroy({ children: true })
    },
  }
}
