/**
 * Pooled combat effects: muzzle smoke and flash, water splashes, island dust, hull impacts and the
 * explosion a destroyed ship leaves behind.
 *
 * The pack ships explosion and fire sprites but no smoke and no splash, so those two are drawn with
 * `Graphics` primitives (approved composition): a puff that expands and fades, and a fan of droplets
 * with a ring on the water. Everything else uses the sprites so the effects match the game's art.
 *
 * Effects are pooled by kind, exactly like the projectile sprites in `render/pools.ts`: nothing is
 * allocated per hit, and `count()`/`stats()` exist so the acceptance "every hit produces visible
 * feedback" can be measured instead of eyeballed.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js'

export type EffectKind = 'muzzle' | 'splash' | 'dust' | 'impact' | 'explosion'

export type EffectsLayer = {
  readonly container: Container
  readonly spawn: (kind: EffectKind, x: number, y: number, options?: SpawnOptions) => void
  readonly update: (dtMs: number) => void
  readonly count: (kind?: EffectKind) => number
  readonly stats: () => { readonly created: number; readonly active: number }
  readonly destroy: () => void
}

export type SpawnOptions = {
  /** Heading of the shot, in radians; the smoke drifts away from it and the flash points along it. */
  readonly rotationRad?: number
  readonly scale?: number
}

type Effect = {
  readonly kind: EffectKind
  readonly container: Container
  elapsedMs: number
  durationMs: number
  active: boolean
  /** Per-effect animation, given progress in [0, 1]. */
  readonly animate: (progress: number) => void
}

const MUZZLE_MS = 380
const SPLASH_MS = 460
const DUST_MS = 300
const IMPACT_MS = 240
const EXPLOSION_MS = 1400

/** Deterministic droplet directions: a fan, no RNG, so the effect is reproducible in tests. */
const SPLASH_DROPS = [
  { angle: -2.5, speed: 26, radius: 2 },
  { angle: -2.1, speed: 38, radius: 2.5 },
  { angle: -1.7, speed: 30, radius: 2 },
  { angle: -1.4, speed: 44, radius: 2.5 },
  { angle: -1.0, speed: 34, radius: 2 },
  { angle: -0.6, speed: 26, radius: 2 },
] as const

/**
 * Alpha for one stage of a multi-stage effect: snap in, hold, then fade over the last stretch. The
 * first version faded linearly and the blast peaked at half opacity — visible, but weak.
 */
function stageAlpha(progress: number, from: number, to: number): number {
  if (progress <= from || progress >= to) return 0

  const local = (progress - from) / (to - from)
  const fade = local <= 0.6 ? 1 : 1 - (local - 0.6) / 0.4
  return Math.min(1, local * 5) * fade
}

export function createEffectsLayer(textures: Readonly<Record<string, Texture>>): EffectsLayer {
  const container = new Container()
  const pools = new Map<EffectKind, Effect[]>()
  let created = 0

  function sprite(name: string, scale: number): Sprite {
    const view = new Sprite(textures[name])
    view.anchor.set(0.5)
    view.scale.set(scale)
    view.visible = false
    return view
  }

  function acquire(kind: EffectKind, build: () => Effect): Effect {
    const pool = pools.get(kind) ?? []
    if (!pools.has(kind)) pools.set(kind, pool)

    const free = pool.find((effect) => !effect.active)
    if (free !== undefined) {
      free.elapsedMs = 0
      free.active = true
      free.container.visible = true
      return free
    }

    const effect = build()
    pool.push(effect)
    container.addChild(effect.container)
    created += 1
    return effect
  }

  function buildMuzzle(options: SpawnOptions): Effect {
    const wrapper = new Container()

    const smoke = new Graphics().circle(0, 0, 6).fill({ color: 0xdfe7ef, alpha: 0.5 })
    const flash = sprite('fire_2', 0.6)
    wrapper.addChild(smoke, flash)

    const rotation = options.rotationRad ?? 0
    const driftX = -Math.sin(rotation)
    const driftY = Math.cos(rotation)

    return {
      kind: 'muzzle',
      container: wrapper,
      elapsedMs: 0,
      durationMs: MUZZLE_MS,
      active: true,
      animate: (progress) => {
        // Smoke expands as it fades and drifts away from the shot.
        smoke.scale.set(0.45 + progress * 1.5)
        smoke.alpha = 0.55 * (1 - progress)
        smoke.x = driftX * progress * 16
        smoke.y = driftY * progress * 16

        // The flash is over in the first third of the effect.
        const flashProgress = Math.min(1, progress * 3)
        flash.visible = flashProgress < 1
        flash.alpha = 1 - flashProgress
        flash.scale.set(0.6 + flashProgress * 0.5)
        flash.rotation = rotation
        flash.x = -driftX * 6 * flashProgress
        flash.y = -driftY * 6 * flashProgress
      },
    }
  }

  function buildSplash(): Effect {
    const wrapper = new Container()
    const ring = new Graphics()
      .ellipse(0, 0, 5, 2.5)
      .stroke({ color: 0xf2f8ff, alpha: 0.85, width: 1.5 })
    const drops = SPLASH_DROPS.map((drop) =>
      new Graphics().circle(0, 0, drop.radius).fill({ color: 0xf2f8ff, alpha: 0.9 }),
    )
    wrapper.addChild(ring, ...drops)

    return {
      kind: 'splash',
      container: wrapper,
      elapsedMs: 0,
      durationMs: SPLASH_MS,
      active: true,
      animate: (progress) => {
        ring.scale.set(1 + progress * 2.6)
        ring.alpha = 0.85 * (1 - progress)
        ring.scale.y = (1 + progress * 2.6) * 0.5

        drops.forEach((drop, index) => {
          const spec = SPLASH_DROPS[index]
          if (spec === undefined) return
          const travel = spec.speed * progress
          drop.x = Math.cos(spec.angle) * travel
          // Gravity pulls the droplets back to the water over the life of the effect.
          drop.y = Math.sin(spec.angle) * travel + 140 * progress * progress
          drop.alpha = 0.9 * (1 - progress)
        })
      },
    }
  }

  function buildBurst(
    kind: 'dust' | 'impact',
    durationMs: number,
    from: number,
    to: number,
  ): Effect {
    const wrapper = new Container()
    const burst = sprite('explosion_3', from)
    const flash = new Graphics().circle(0, 0, 7).fill({ color: 0xffe9a8, alpha: 0.8 })
    wrapper.addChild(flash, burst)

    return {
      kind,
      container: wrapper,
      elapsedMs: 0,
      durationMs,
      active: true,
      animate: (progress) => {
        burst.visible = true
        burst.scale.set(from + (to - from) * progress)
        burst.alpha = 1 - progress * progress
        flash.scale.set(0.4 + progress * 1.6)
        flash.alpha = 0.8 * (1 - progress)
      },
    }
  }

  function buildExplosion(): Effect {
    const wrapper = new Container()
    const small = sprite('explosion_3', 0.5)
    const medium = sprite('explosion_2', 0.9)
    const large = sprite('explosion_1', 1.1)
    const fireA = sprite('fire_1', 1.6)
    const fireB = sprite('fire_2', 1.8)
    wrapper.addChild(small, medium, large, fireA, fireB)

    return {
      kind: 'explosion',
      container: wrapper,
      elapsedMs: 0,
      durationMs: EXPLOSION_MS,
      active: true,
      animate: (progress) => {
        // Three blast stages that overlap, then two flames that linger and rise out of the wreck.
        const stages = [
          { view: small, from: 0, to: 0.3, scale: 0.7 },
          { view: medium, from: 0.18, to: 0.55, scale: 1.15 },
          { view: large, from: 0.4, to: 0.8, scale: 1.4 },
        ]

        for (const stage of stages) {
          const alpha = stageAlpha(progress, stage.from, stage.to)
          stage.view.visible = alpha > 0
          stage.view.alpha = alpha

          if (alpha > 0) {
            const local = (progress - stage.from) / (stage.to - stage.from)
            stage.view.scale.set(stage.scale * (0.75 + local * 0.5))
          }
        }

        const fireProgress = Math.max(0, (progress - 0.45) / 0.55)
        const fireFade = fireProgress <= 0.6 ? 1 : 1 - (fireProgress - 0.6) / 0.4
        const fireAlpha = fireProgress > 0 ? 0.95 * Math.max(0, fireFade) : 0

        fireA.visible = fireAlpha > 0
        fireB.visible = fireAlpha > 0
        fireA.alpha = fireAlpha
        fireB.alpha = fireAlpha * 0.85
        fireA.y = -fireProgress * 10
        fireB.y = -fireProgress * 16
        fireA.x = -6
        fireB.x = 7
      },
    }
  }

  /** One builder per kind: adding an effect means adding a line here, not another nested branch. */
  const builders: Record<EffectKind, (options: SpawnOptions) => Effect> = {
    muzzle: buildMuzzle,
    splash: () => buildSplash(),
    dust: () => buildBurst('dust', DUST_MS, 0.4, 0.62),
    impact: () => buildBurst('impact', IMPACT_MS, 0.28, 0.44),
    explosion: buildExplosion,
  }

  return {
    container,
    spawn: (kind, x, y, options = {}) => {
      const effect = acquire(kind, () => builders[kind](options))
      effect.container.x = x
      effect.container.y = y
      effect.container.scale.set(options.scale ?? 1)
      effect.container.visible = true
      effect.container.alpha = 1
      effect.animate(0)
    },
    update: (dtMs) => {
      for (const pool of pools.values()) {
        for (const effect of pool) {
          if (!effect.active) continue

          effect.elapsedMs += dtMs
          const progress = Math.min(1, effect.elapsedMs / effect.durationMs)
          effect.animate(progress)

          if (progress >= 1) {
            effect.active = false
            effect.container.visible = false
          }
        }
      }
    },
    count: (kind) => {
      let total = 0
      for (const [poolKind, pool] of pools) {
        if (kind !== undefined && poolKind !== kind) continue
        total += pool.filter((effect) => effect.active).length
      }
      return total
    },
    stats: () => ({
      created,
      active: [...pools.values()].reduce(
        (sum, pool) => sum + pool.filter((effect) => effect.active).length,
        0,
      ),
    }),
    destroy: () => {
      container.destroy({ children: true })
      pools.clear()
    },
  }
}
