import { expect, pendingQueue, test } from './fixtures.ts'

test.describe('leaving, wandering and touching', () => {
  test('abandoning a match records nothing', async ({ app }) => {
    await app.open()
    await app.play()
    await app.hold('Space', 120)
    await app.advance(3000)

    await app.page.click('[data-testid="exit"]')
    await app.waitForMenu()
    await expect(app.page.locator('[data-testid="last-result"]')).toContainText(
      'No finished match yet',
    )

    await app.openLog('history')
    await expect(app.page.locator('[data-testid="query-empty"]')).toBeVisible()
    expect(Object.keys(await pendingQueue(app.page))).toHaveLength(0)
  })

  test('wandering between the screens leaves no errors behind', async ({ app }) => {
    const errors: string[] = []
    app.page.on('pageerror', (error) => errors.push(error.message))
    app.page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await app.open()
    for (let round = 0; round < 3; round += 1) {
      await app.waitForMenu()
      await app.page.click('[data-testid="options"]')
      await app.page.waitForSelector('[data-testid="options-back"]')
      await app.page.click('[data-testid="options-back"]')

      await app.openLog('ranking')
      await expect(app.page.locator('[data-testid="ranking-row"]').first()).toBeVisible()
      await app.page.click('[data-testid="tab-history"]')
      await expect(app.page.locator('[data-testid="log-subtitle"]')).toBeVisible()
      await app.page.click('[data-testid="log-back"]')
    }

    expect(errors).toEqual([])
  })

  test('the touch controls sail the ship and fire the guns', async ({ app }) => {
    await app.open({ touch: true })
    await app.play()
    await expect(app.page.locator('[data-testid="touch-controls"]')).toBeVisible()

    const stick = await app.box('[data-testid="touch-stick"]')
    if (stick === undefined) throw new Error('the touch stick is not on screen')
    const centreX = stick.x + stick.width / 2
    const centreY = stick.y + stick.height / 2

    const start = await app.state()
    await app.page.mouse.move(centreX, centreY)
    await app.page.mouse.down()
    await app.page.mouse.move(centreX, centreY - stick.height / 2, { steps: 4 })
    await app.advance(1500)
    const sailed = await app.state()
    await app.page.mouse.up()

    expect(
      Math.hypot(sailed.player.x - start.player.x, sailed.player.y - start.player.y),
    ).toBeGreaterThan(40)

    // Releasing the stick stops the ship.
    await app.advance(1500)
    const stopped = await app.state()
    expect(
      Math.hypot(stopped.player.x - sailed.player.x, stopped.player.y - sailed.player.y),
    ).toBeLessThan(140)

    // A gun button fires without the stick being touched at all.
    const before = await app.shots()
    const gun = await app.box('[data-testid="touch-fireFront"]')
    if (gun === undefined) throw new Error('the bow gun button is not on screen')
    await app.page.mouse.move(gun.x + gun.width / 2, gun.y + gun.height / 2)
    await app.page.mouse.down()
    await app.advance(300)
    await app.page.mouse.up()

    expect(await app.shots()).toBeGreaterThan(before)
  })
})
