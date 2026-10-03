import { expect, pendingQueue, storedRecords, test } from './fixtures.ts'

const queued = async (page: import('@playwright/test').Page): Promise<number> =>
  Object.keys(await pendingQueue(page)).length
const stored = async (page: import('@playwright/test').Page): Promise<number> =>
  (await storedRecords(page)).length

test.describe('timeouts, retries and late answers', () => {
  test('a lost answer is retried and never duplicates the match', async ({ app }) => {
    await app.open({ scenario: 'timeout-after-save' })
    await app.play()
    await app.advance(65_000)
    await app.page.waitForSelector('[data-testid="result-registration"]')

    // The answer never arrives, so the screen offers a retry and the queue keeps the match.
    await expect(app.page.locator('[data-testid="retry-registration"]')).toBeVisible({
      timeout: 30_000,
    })
    expect(await queued(app.page)).toBe(1)
    // The server stores the record *after* the delay, so the answer is lost while the write survives.
    // The check therefore waits for the write rather than assuming it beat the client's timeout.
    await expect.poll(async () => stored(app.page), { timeout: 15_000 }).toBe(41)

    // Three more attempts, each losing its answer again.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await app.page.click('[data-testid="retry-registration"]')
      await app.page.waitForTimeout(6500)
    }

    // Still one record — the retries re-sent the same match id.
    expect(await stored(app.page)).toBe(41)
    expect(await queued(app.page)).toBe(1)

    // The network recovers.
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

    await expect(app.page.locator('[data-testid="result-registration"]')).toContainText(
      'Registered',
      {
        timeout: 20_000,
      },
    )
    expect(await queued(app.page)).toBe(0)
    // The recovery registered the match, it did not register it again.
    expect(await stored(app.page)).toBe(41)
  })

  test('a late answer does not overwrite the page that was asked for last', async ({ app }) => {
    await app.open({ scenario: 'out-of-order' })
    await app.openLog('ranking')
    await expect(app.page.locator('[data-testid="ranking-row"]').first()).toBeVisible()

    // The next page is asked for straight away; this scenario answers it first on purpose.
    await app.page.click('[data-testid="page-next"]')
    await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 2 of 2')
    expect(await app.page.locator('[data-testid="ranking-row"]').count()).toBe(3)

    // Past the first request's own latency: the screen must still be showing page two.
    await app.page.waitForTimeout(3000)
    await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 2 of 2')
    expect(await app.page.locator('[data-testid="ranking-row"]').count()).toBe(3)
    await expect(app.page.locator('[data-testid="ranking-row"]').first()).toContainText('16')
  })
})
