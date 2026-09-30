/**
 * Cannonballs. One pooled sprite per living projectile, keyed by entity id, interpolated between the
 * last two fixed steps like every other moving thing.
 *
 * Views are released from the `entityRemoved` events the simulation emits — never by diffing the
 * world — so a shot that dies mid-step frees its sprite exactly once even when one animation frame
 * runs several steps.
 */
import { Container, type Sprite, type Texture } from 'pixi.js'

import { lerp } from '../../core/math.ts'
import type { World } from '../../sim/World.ts'
import { createSpritePool, type SpritePool } from '../pools.ts'

export type ProjectileViewStats = {
  readonly created: number
  readonly active: number
  readonly pooled: number
}

export type ProjectileViews = {
  /** Places a sprite for every living projectile and hides the ones already released. */
  sync(world: World, alpha: number): void
  /** Frees the sprites of the given entity ids. */
  release(ids: readonly number[]): void
  stats(): ProjectileViewStats
  destroy(): void
}

export function createProjectileViews(options: {
  texture: Texture
  layer: Container
}): ProjectileViews {
  const pool: SpritePool = createSpritePool({ texture: options.texture, layer: options.layer })
  const sprites = new Map<number, Sprite>()
  /** Logical radius of the sprite in the sheet, used to scale shots of a different size. */
  const baseRadius = options.texture.width / 2

  return {
    sync(world: World, alpha: number): void {
      for (const projectile of world.projectiles) {
        let sprite = sprites.get(projectile.id)

        if (sprite === undefined) {
          sprite = pool.acquire()
          sprite.scale.set(projectile.radius / baseRadius)
          sprites.set(projectile.id, sprite)
        }

        sprite.x = lerp(projectile.prevX, projectile.x, alpha)
        sprite.y = lerp(projectile.prevY, projectile.y, alpha)
      }
    },

    release(ids: readonly number[]): void {
      for (const id of ids) {
        const sprite = sprites.get(id)
        if (sprite === undefined) continue
        pool.release(sprite)
        sprites.delete(id)
      }
    },

    stats(): ProjectileViewStats {
      return {
        created: pool.created,
        active: sprites.size,
        pooled: pool.created - pool.inUse,
      }
    },

    destroy(): void {
      sprites.clear()
      pool.destroy()
    },
  }
}
