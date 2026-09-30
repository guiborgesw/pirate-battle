/**
 * Sprite pooling for short-lived objects (cannonballs now, hit effects in M10).
 *
 * Sprites are created on demand, stay children of their layer for the whole session and are only
 * toggled visible. That keeps a busy fight from adding and removing children every frame — the
 * expensive part — while the pool reports `created` / `inUse` so a leak is visible in numbers.
 */
import { Sprite, type Container, type Texture } from 'pixi.js'

export type SpritePool = {
  acquire(): Sprite
  release(sprite: Sprite): void
  /** How many sprites the pool has ever allocated. Should plateau, never grow forever. */
  readonly created: number
  readonly inUse: number
  /** Drops the free list; the layer that owns the sprites destroys them with its children. */
  destroy(): void
}

export function createSpritePool(options: { texture: Texture; layer: Container }): SpritePool {
  const free: Sprite[] = []
  let created = 0
  let inUse = 0

  return {
    acquire(): Sprite {
      const pooled = free.pop()

      if (pooled !== undefined) {
        pooled.visible = true
        inUse += 1
        return pooled
      }

      const sprite = new Sprite({ texture: options.texture })
      sprite.anchor.set(0.5, 0.5)
      sprite.visible = true
      options.layer.addChild(sprite)

      created += 1
      inUse += 1
      return sprite
    },

    release(sprite: Sprite): void {
      // Guard against a double release, which would let one sprite back into the free list twice.
      if (!sprite.visible) return
      sprite.visible = false
      free.push(sprite)
      inUse -= 1
    },

    get created(): number {
      return created
    },

    get inUse(): number {
      return inUse
    },

    destroy(): void {
      free.length = 0
      inUse = 0
    },
  }
}
