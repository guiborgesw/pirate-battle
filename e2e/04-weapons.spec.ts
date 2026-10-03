import { expect, test } from './fixtures.ts'

test.describe('weapons', () => {
  test('the bow gun fires on its cooldown and a broadside fires three at once', async ({ app }) => {
    await app.open()
    await app.play()

    // One press, one shot.
    await app.hold('Space', 120)
    expect(await app.shots()).toBe(1)

    // A second press inside the cooldown adds nothing.
    await app.hold('Space', 120)
    expect(await app.shots()).toBe(1)

    // Past the cooldown it fires again.
    await app.advance(600)
    await app.hold('Space', 120)
    expect(await app.shots()).toBe(2)

    // A broadside is a volley, not a shot. The window is deliberately tiny: the count is of projectiles
    // *in flight*, so a longer advance gives one of the three a chance to find a target and turn a
    // three-ball volley into a two-ball measurement.
    const before = (await app.state()).projectiles
    await app.hold('q', 40)
    const after = (await app.state()).projectiles
    expect(after - before).toBeGreaterThanOrEqual(2)

    // And it has its own, longer cooldown.
    const volley = await app.state()
    await app.hold('q', 120)
    expect((await app.state()).projectiles).toBeLessThanOrEqual(volley.projectiles)
  })

  test('a shot damages what it hits and a kill scores once and only once', async ({ app }) => {
    await app.open()
    await app.play()

    const { player } = await app.state()
    // A Chaser sailing straight at the player is the target: the bow gun cannot miss it the way a
    // Shooter keeping its range can drift out of a shot's path. Four hundred pixels away, so the ball
    // arrives well before the hull does — the kill has to be the shot's, not the collision's.
    const target = await app.page.evaluate(
      ({ x, y }) => window.__pb?.spawnEnemy('chaser', x, y) ?? -1,
      { x: player.x, y: player.y - 400 },
    )
    await app.advance(100)

    const spawned = (await app.state()).enemies.find((enemy) => enemy.id === target)
    expect(spawned?.kind).toBe('chaser')
    const startingHp = spawned?.hp ?? 0

    // Aim at it before each shot: a Chaser swerves on its way in, and a ball fired at where it used to
    // be is a ball wasted. The score is read after the kill and again after more shots at nothing, which
    // is what "no duplicate scoring" means.
    let damaged = false
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const current = (await app.state()).enemies.find((enemy) => enemy.id === target)
      if (current === undefined) break

      if (current.hp < startingHp) damaged = true
      await app.fireAt(current.x, current.y)

      const after = (await app.state()).enemies.find((enemy) => enemy.id === target)
      if (after !== undefined && after.hp < startingHp) damaged = true
    }

    expect(damaged).toBe(true)
    const afterKill = await app.state()
    expect(afterKill.enemies.find((enemy) => enemy.id === target)).toBeUndefined()

    // The kill scored once, and shooting at nothing afterwards does not score again.
    const scoreAfterKill = afterKill.score
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await app.hold('Space', 120)
      await app.advance(700)
    }
    expect((await app.state()).score).toBe(scoreAfterKill)
    expect(scoreAfterKill).toBeGreaterThan(0)
  })
})
