/**
 * Pixi host: creates the renderer, letterboxes the fixed 1280x720 arena inside whatever space the
 * React layout gives it, and keeps the backing store at the device pixel ratio.
 *
 * The arena lives in a single `world` container, so input mapping (M13) and future camera work only
 * need `world.scale` / `world.position` instead of touching every view.
 */
import { Application, Container } from 'pixi.js'

import type { Circle } from '../../config/gameConfig.ts'

export type ArenaSize = {
  readonly width: number
  readonly height: number
}

export type LogicalPoint = {
  readonly x: number
  readonly y: number
}

export type Renderer = {
  readonly app: Application
  /** Letterboxed container that holds the arena; children use logical (1280x720) coordinates. */
  readonly world: Container
  readonly canvas: HTMLCanvasElement
  readonly size: ArenaSize
  /** Current fit factor between logical units and CSS pixels. */
  scaleFactor(): number
  /** Converts viewport coordinates into arena coordinates (used by touch input in M13). */
  toLogical(clientX: number, clientY: number): LogicalPoint
  resize(): void
  destroy(): void
}

function fitFactor(hostWidth: number, hostHeight: number, size: ArenaSize): number {
  return Math.min(hostWidth / size.width, hostHeight / size.height)
}

export async function createRenderer(options: {
  host: HTMLElement
  size: ArenaSize
}): Promise<Renderer> {
  const { host, size } = options
  const app = new Application()

  const initialWidth = Math.max(host.clientWidth, 1)
  const initialHeight = Math.max(host.clientHeight, 1)

  await app.init({
    width: initialWidth,
    height: initialHeight,
    background: '#0b2f4a',
    antialias: false,
    resolution: Math.max(window.devicePixelRatio, 1),
    autoDensity: true,
    preference: 'webgl',
  })

  host.appendChild(app.canvas)

  const world = new Container()
  app.stage.addChild(world)

  let currentFit = fitFactor(initialWidth, initialHeight, size)

  function applyLayout(): void {
    const hostWidth = Math.max(host.clientWidth, 1)
    const hostHeight = Math.max(host.clientHeight, 1)
    const devicePixelRatio = Math.max(window.devicePixelRatio, 1)

    app.renderer.resolution = devicePixelRatio
    app.renderer.resize(hostWidth, hostHeight)

    currentFit = fitFactor(hostWidth, hostHeight, size)
    world.scale.set(currentFit)
    world.position.set(
      (hostWidth - size.width * currentFit) / 2,
      (hostHeight - size.height * currentFit) / 2,
    )
  }

  applyLayout()

  const observer = new ResizeObserver(() => {
    applyLayout()
  })
  observer.observe(host)

  return {
    app,
    world,
    canvas: app.canvas,
    size,

    scaleFactor: () => currentFit,

    toLogical(clientX: number, clientY: number): LogicalPoint {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - world.position.x) / currentFit,
        y: (clientY - rect.top - world.position.y) / currentFit,
      }
    },

    resize: applyLayout,

    destroy(): void {
      observer.disconnect()
      app.ticker.stop()
      app.stage.removeChildren()
      // Two arguments on purpose (Pixi 8): the first object configures the renderer teardown, the
      // second decides what happens to the scene graph. `texture: false` keeps the cached
      // spritesheets alive so re-entering a match does not re-download them.
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })
    },
  }
}

/** Convenience for M13: circle hit-testing stays in logical units. */
export function isInsideCircle(point: LogicalPoint, circle: Circle): boolean {
  const dx = point.x - circle.x
  const dy = point.y - circle.y
  return dx * dx + dy * dy <= circle.radius * circle.radius
}
