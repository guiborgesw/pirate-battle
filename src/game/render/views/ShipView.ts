/**
 * A ship, composed from the asset pack's parts: hull + mast pole + sail + flag + bow cannon.
 *
 * Composing instead of using the pre-assembled `ship_*` sprites buys three things: the progressive
 * damage ladder (`hull_large_1..4` / `hull_small_1..4`), per-kind sail and flag colours, and the
 * wreck look for the sinking animation. The offsets below were tuned against the assembled sprites
 * and the mockups; all parts share the same origin (the ship's centre).
 */
import { Container, Sprite, type Spritesheet } from 'pixi.js'

import { shipAppearance } from '../../../config/shipAppearance.ts'
import { lerp, lerpAngle } from '../../core/math.ts'
import type { Ship } from '../../sim/entities.ts'
import { textureOrThrow } from '../textures.ts'

export type ShipView = {
  readonly container: Container
  /** Interpolates between the previous and the current fixed step. */
  sync(ship: Ship, alpha: number): void
  destroy(): void
}

/** Offsets in logical pixels, relative to the ship centre, for a ship facing up. */
const PART_OFFSETS = {
  hull: { x: 0, y: 4 },
  sail: { x: 0, y: -20 },
  pole: { x: 0, y: -34 },
  flag: { x: 6, y: -36 },
  cannon: { x: 0, y: 26 },
} as const

const CANNON_FRAME = 'cannon'
const POLE_FRAME = 'pole'

export function createShipView(options: { parts: Spritesheet; ship: Ship }): ShipView {
  const container = new Container()

  const hull = new Sprite({ texture: textureOrThrow(options.parts, 'hull_large_1') })
  hull.anchor.set(0.5, 0.5)
  hull.position.set(PART_OFFSETS.hull.x, PART_OFFSETS.hull.y)

  const pole = new Sprite({ texture: textureOrThrow(options.parts, POLE_FRAME) })
  pole.anchor.set(0.5, 1)
  pole.position.set(PART_OFFSETS.pole.x, PART_OFFSETS.pole.y)

  const sail = new Sprite({ texture: textureOrThrow(options.parts, 'sail_large_1') })
  sail.anchor.set(0.5, 0.5)
  sail.position.set(PART_OFFSETS.sail.x, PART_OFFSETS.sail.y)

  const flag = new Sprite({ texture: textureOrThrow(options.parts, 'flag_1') })
  flag.anchor.set(0.5, 1)
  flag.position.set(PART_OFFSETS.flag.x, PART_OFFSETS.flag.y)

  const cannon = new Sprite({ texture: textureOrThrow(options.parts, CANNON_FRAME) })
  cannon.anchor.set(0.5, 0.5)
  cannon.position.set(PART_OFFSETS.cannon.x, PART_OFFSETS.cannon.y)

  container.addChild(hull, pole, sail, flag, cannon)

  let currentTier = -1

  function applyAppearance(ship: Ship): void {
    const appearance = shipAppearance(ship.kind, ship.hp / ship.maxHp, !ship.alive)
    if (appearance.hullTier === currentTier) return

    currentTier = appearance.hullTier
    hull.texture = textureOrThrow(options.parts, appearance.hullFrame)
    sail.texture = textureOrThrow(options.parts, appearance.sailFrame)
    flag.texture = textureOrThrow(options.parts, appearance.flagFrame)
  }

  applyAppearance(options.ship)

  return {
    container,

    sync(ship: Ship, alpha: number): void {
      applyAppearance(ship)
      container.x = lerp(ship.prevX, ship.x, alpha)
      container.y = lerp(ship.prevY, ship.y, alpha)
      container.rotation = lerpAngle(ship.prevRotation, ship.rotation, alpha)
    },

    destroy(): void {
      container.removeChildren()
      container.destroy({ children: true })
    },
  }
}
