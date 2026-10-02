/**
 * Health bars above every ship.
 *
 * Built from the bar parts that ship with the UI atlas (`health_frame` plus
 * `health_fill_green|amber|red`) — the same parts the challenge mockups draw over their ships, so
 * the bar matches the reference instead of being reinventing a look with Graphics.
 *
 * One bar per ship, reused for the whole match: the texture only swaps when the colour tier changes
 * and the width only when the ratio moves, so a hit costs a couple of property writes rather than a
 * redraw per frame. Bars live in their own unrotated layer, so they stay level while the hull beneath
 * them rolls.
 */
import { Container, Sprite, type Spritesheet, type Texture } from 'pixi.js'

import { HEALTH_BAR, healthBarTier, type HealthBarTier } from '../../../config/shipAppearance.ts'
import { clamp, lerp } from '../../core/math.ts'
import type { Ship } from '../../sim/entities.ts'
import { textureOrThrow } from '../textures.ts'

const FRAME_FRAME = 'health_frame'
const FILL_FRAMES: Record<HealthBarTier, string> = {
  green: 'health_fill_green',
  amber: 'health_fill_amber',
  red: 'health_fill_red',
}

/** The bar art's usable box inside the 256x48 atlas frames (measured; see docs/assets-reference.md). */
const FILL_ART_LEFT_PX = 30
const FILL_ART_WIDTH_PX = 196

export type HealthBarView = {
  /** Added to the session's bar layer once, and reused for the whole match. */
  readonly container: Container
  sync(ship: Ship, alpha: number): void
  destroy(): void
}

export function createHealthBarView(options: { parts: Spritesheet; ship: Ship }): HealthBarView {
  const frameTexture = textureOrThrow(options.parts, FRAME_FRAME)
  const fillTextures: Record<HealthBarTier, Texture> = {
    green: textureOrThrow(options.parts, FILL_FRAMES.green),
    amber: textureOrThrow(options.parts, FILL_FRAMES.amber),
    red: textureOrThrow(options.parts, FILL_FRAMES.red),
  }

  const scale = HEALTH_BAR.widthPx / frameTexture.width

  const container = new Container()

  const frame = new Sprite({ texture: frameTexture })
  frame.anchor.set(0.5, 0.5)
  frame.scale.set(scale)
  container.addChild(frame)

  const fill = new Sprite({ texture: fillTextures.green })
  // Anchor on the left edge of the art, so the fill drains to the right instead of shrinking towards
  // the middle like a bar that is loading.
  fill.anchor.set(FILL_ART_LEFT_PX / fillTextures.green.width, 0.5)
  fill.scale.set(scale)
  fill.position.set((FILL_ART_LEFT_PX / fillTextures.green.width - 0.5) * HEALTH_BAR.widthPx, 0)
  container.addChild(fill)

  const fullFillWidth = FILL_ART_WIDTH_PX * scale
  let drawnTier: HealthBarTier = 'green'
  let drawnRatio = 1

  return {
    container,

    sync(ship: Ship, alpha: number): void {
      container.x = lerp(ship.prevX, ship.x, alpha)
      container.y = lerp(ship.prevY, ship.y, alpha) - ship.radius - HEALTH_BAR.offsetAboveShipPx

      const ratio = ship.maxHp <= 0 ? 0 : clamp(ship.hp / ship.maxHp, 0, 1)

      const tier = healthBarTier(ratio)
      if (tier !== drawnTier) {
        fill.texture = fillTextures[tier]
        drawnTier = tier
      }

      if (ratio !== drawnRatio) {
        fill.width = fullFillWidth * ratio
        drawnRatio = ratio
      }
    },

    destroy(): void {
      container.destroy({ children: true })
    },
  }
}
