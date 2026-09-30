/**
 * Arena background. The tileset ships exactly one water tile (`tile_r4c8`), so the water is drawn as
 * a single tiling sprite instead of a 16x6 grid of sprites: one draw call, no seams, and the retina
 * tile sheet keeps it crisp on high-DPR screens.
 */
import { TilingSprite, type Texture } from 'pixi.js'

export type ArenaBackgroundOptions = {
  readonly waterTexture: Texture
  readonly width: number
  readonly height: number
}

export function createArenaBackground(options: ArenaBackgroundOptions): TilingSprite {
  return new TilingSprite({
    texture: options.waterTexture,
    width: options.width,
    height: options.height,
  })
}
