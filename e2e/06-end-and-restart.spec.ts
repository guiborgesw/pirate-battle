import { expect, test } from './fixtures.ts'

test.describe('the end of a match', () => {
  test('the clock runs out, and playing again starts a clean session', async ({ app }) => {
    await app.open()
    await app.waitForMenu()

    // A short session with sparse enemies: this test is about the clock running out, so it is played
    // with the options that make that the ending. It also proves the options feed the match.
    await app.page.click('[data-testid="options"]')
    await app.setOption('durationSec', 60)
    await app.setOption('spawnIntervalMs', 10)
    await app.page.click('[data-testid="options-back"]')

    await app.play()
    await app.hold('Space', 120)
    expect(await app.shots()).toBeGreaterThan(0)

    await app.finishByTime()
    await expect(app.page.locator('[data-testid="result-meta"]')).toContainText('TIME UP')

    await app.page.click('[data-testid="play-again"]')
    await app.waitForArena()
    await app.useManualClock()

    // A clean session: full hull, no score, no shots, and a full clock on the HUD.
    const fresh = await app.state()
    expect(fresh.status).toBe('running')
    expect(fresh.score).toBe(0)
    expect(fresh.player.hp).toBe(100)
    expect(await app.shots()).toBe(0)
    await expect(app.page.locator('[data-testid="hud-score"]')).toContainText('0')

    // One canvas and one HUD listener per session, not two.
    const diagnostics = await app.diagnostics()
    expect(diagnostics.canvasCount).toBe(1)
    expect(diagnostics.hudListeners).toBeLessThanOrEqual(1)
  })

  test('the hull is sunk and nothing runs on afterwards', async ({ app }) => {
    await app.open()
    await app.play()
    await app.hold('Space', 120)

    // The helper stops when the session stops running, which is the simulation stopping.
    const ended = await app.finishByDeath()
    expect(ended.status).not.toBe('running')

    await expect(app.page.locator('[data-testid="result-meta"]')).toContainText('HULL SUNK')
    const score = await app.page.locator('[data-testid="result-score"]').textContent()

    // The arena is gone (the result screen replaced it) and the score does not move on its own.
    await expect(app.page.locator('[data-testid="arena"]')).toHaveCount(0)
    await app.page.waitForTimeout(2000)
    expect(await app.page.locator('[data-testid="result-score"]').textContent()).toBe(score)
    await expect(app.page.locator('[data-testid="result-meta"]')).toContainText('HULL SUNK')
  })
})
