import { expect, pendingQueue, test } from './fixtures.ts'

test.describe('registering a match', () => {
  test('a finished match reaches both tabs, with the player’s own row highlighted', async ({
    app,
  }) => {
    await app.open()
    await app.play()
    await app.hold('Space', 120)
    await app.finishByTime()

    // The registration is announced and confirmed without the player doing anything.
    await expect(app.page.locator('[data-testid="result-registration"]')).toContainText(
      'Registered',
      {
        timeout: 30_000,
      },
    )

    await app.toMenu()
    await app.openLog('history')
    await expect(app.page.locator('[data-testid="history-row"]')).toHaveCount(1)

    // The ranking knows the same match, on whichever page the player's score lands.
    await app.page.click('[data-testid="tab-ranking"]')
    await expect(app.page.locator('[data-testid="ranking-row"]').first()).toBeVisible()
    let own = await app.page.locator('[data-testid="ranking-row"]', { hasText: 'You' }).count()
    if (own === 0) {
      await app.page.click('[data-testid="page-next"]')
      await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 2')
      own = await app.page.locator('[data-testid="ranking-row"]', { hasText: 'You' }).count()
    }
    expect(own).toBe(1)
  })

  test('a match queued while the network was down registers after a reload', async ({ app }) => {
    await app.open({ scenario: 'offline-at-end' })
    await app.play()
    await app.advance(65_000)
    await app.page.waitForSelector('[data-testid="result-registration"]')

    // The attempt failed, and the match is waiting.
    await expect(app.page.locator('[data-testid="retry-registration"]')).toBeVisible({
      timeout: 30_000,
    })
    expect(Object.keys(await pendingQueue(app.page))).toHaveLength(1)

    // The queue survives the refresh.
    await app.page.reload()
    await app.waitForMenu()
    expect(Object.keys(await pendingQueue(app.page))).toHaveLength(1)

    // The network comes back and the browser says so.
    await app.page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true }),
      )
    })
    await app.page.waitForSelector('[data-testid="mock-scenario"]')
    await app.page.selectOption('[data-testid="mock-scenario"]', 'success')
    await app.page.evaluate(() => {
      window.dispatchEvent(new Event('online'))
    })

    await expect.poll(async () => Object.keys(await pendingQueue(app.page)).length).toBe(0)

    await app.openLog('history')
    await expect(app.page.locator('[data-testid="history-row"]')).toHaveCount(1)
  })
})
