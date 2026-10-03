import { expect, test } from './fixtures.ts'
import type { SessionState } from './fixtures.ts'

function distanceTo(state: SessionState, id: number, from: { x: number; y: number }): number {
  const enemy = state.enemies.find((candidate) => candidate.id === id)
  if (enemy === undefined) throw new Error(`enemy ${id} is gone`)
  return Math.hypot(enemy.x - from.x, enemy.y - from.y)
}

test.describe('enemies', () => {
  test('the schedule fills the arena with both kinds', async ({ app }) => {
    await app.open()
    await app.play()

    expect((await app.state()).enemies.length).toBe(0)

    // One spawn interval later there is company.
    await app.advance(3200)
    expect((await app.state()).enemies.length).toBeGreaterThan(0)

    // The plan guarantees a Chaser and a Shooter in the first two waves.
    await app.advance(3600)
    const kinds = new Set((await app.state()).enemies.map((enemy) => enemy.kind))
    expect(kinds.has('chaser')).toBe(true)
    expect(kinds.has('shooter')).toBe(true)
  })

  test('a Chaser closes in and hurts the hull; a Shooter keeps its distance', async ({ app }) => {
    await app.open()
    await app.play()

    const { player } = await app.state()
    const chaser = await app.page.evaluate(
      ({ x, y }) => window.__pb?.spawnEnemy('chaser', x, y) ?? -1,
      { x: player.x + 280, y: player.y },
    )
    const shooter = await app.page.evaluate(
      ({ x, y }) => window.__pb?.spawnEnemy('shooter', x, y) ?? -1,
      { x: player.x - 280, y: player.y },
    )
    await app.advance(100)

    const before = await app.state()
    const chaserBefore = distanceTo(before, chaser, player)
    await app.advance(2500)
    const after = await app.state()

    // The Chaser came for the player. It may have got there already — a Chaser that reaches the hull
    // damages it and is destroyed doing so — so "closer, or gone with the hull dented" is the evidence.
    const chaserNow = after.enemies.find((enemy) => enemy.id === chaser)
    if (chaserNow === undefined) {
      expect(after.player.hp).toBeLessThan(before.player.hp)
    } else {
      expect(distanceTo(after, chaser, player)).toBeLessThan(chaserBefore - 40)
    }

    // Whatever the Shooter does, it is not the one closing in.
    if (after.enemies.some((enemy) => enemy.id === shooter) && chaserNow !== undefined) {
      expect(distanceTo(after, chaser, player)).toBeLessThan(distanceTo(after, shooter, player))
    }

    // A Chaser that reaches the hull takes the hull down with it (and scores nothing).
    const scoreBefore = after.score
    const hpBefore = after.player.hp
    await app.advance(5000)
    const contact = await app.state()
    expect(contact.player.hp).toBeLessThan(hpBefore)
    expect(contact.score).toBe(scoreBefore)
  })
})
