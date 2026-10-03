import { DEFAULT_GAME_CONFIG } from '../src/config/gameConfig.ts'
import { expect, test } from './fixtures.ts'

const PLAYER_RADIUS = DEFAULT_GAME_CONFIG.player.radius

function nearestIslandCircle(x: number, y: number): { x: number; y: number; radius: number } {
  const circles = DEFAULT_GAME_CONFIG.islands.flatMap((island) => island.circles)
  const sorted = [...circles].sort(
    (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
  )
  const nearest = sorted[0]
  if (nearest === undefined) throw new Error('the configuration has no islands to sail into')
  return nearest
}

test.describe('sailing', () => {
  test('the ship sails forward, turns, and cannot leave the arena', async ({ app }) => {
    await app.open()
    await app.play()

    const start = await app.state()
    await app.hold('w', 1200)
    const sailed = await app.state()

    const travelled = Math.hypot(sailed.player.x - start.player.x, sailed.player.y - start.player.y)
    expect(travelled).toBeGreaterThan(80)
    // Rotation zero points north, so forward is negative y.
    expect(sailed.player.y).toBeLessThan(start.player.y)

    const before = sailed.player.rotation
    await app.hold('d', 600)
    const turned = await app.state()
    expect(turned.player.rotation).not.toBeCloseTo(before, 2)
    expect(await app.diagnostics()).toMatchObject({ keyboardAttached: true })

    // The arena has bounds: a long run north cannot leave it.
    await app.hold('w', 12_000)
    const bounded = await app.state()
    expect(bounded.player.x).toBeGreaterThanOrEqual(0)
    expect(bounded.player.x).toBeLessThanOrEqual(DEFAULT_GAME_CONFIG.arena.width)
    expect(bounded.player.y).toBeGreaterThanOrEqual(0)
    expect(bounded.player.y).toBeLessThanOrEqual(DEFAULT_GAME_CONFIG.arena.height)
  })

  test('an island stops the ship rather than letting it through', async ({ app }) => {
    await app.open()
    await app.play()

    const { player } = await app.state()
    const island = nearestIslandCircle(player.x, player.y)

    let closest = Number.POSITIVE_INFINITY
    let everMoved = false

    for (let step = 0; step < 14; step += 1) {
      const before = (await app.state()).player
      await app.steerTowards(island.x, island.y, 700)
      const after = (await app.state()).player

      if (Math.hypot(after.x - before.x, after.y - before.y) > 2) everMoved = true
      closest = Math.min(closest, Math.hypot(after.x - island.x, after.y - island.y))

      // The hull is a circle and so is the island: the two never overlap.
      expect(closest).toBeGreaterThan(island.radius + PLAYER_RADIUS - 12)
    }

    // The sail actually happened, and it ended up against the island rather than short of it.
    expect(everMoved).toBe(true)
    expect(closest).toBeLessThan(island.radius + PLAYER_RADIUS + 90)
  })
})
