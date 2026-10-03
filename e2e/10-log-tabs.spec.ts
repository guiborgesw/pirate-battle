import { expect, test } from './fixtures.ts'

test.describe('the Captain’s log', () => {
  test('the ranking loads page by page', async ({ app }) => {
    await app.open()
    await app.openLog('ranking')

    const rows = app.page.locator('[data-testid="ranking-row"]')
    await expect(rows.first()).toBeVisible()
    await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 1 of 2')
    expect(await rows.count()).toBe(15)

    await app.page.click('[data-testid="page-next"]')
    await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 2 of 2')
    expect(await rows.count()).toBe(3)

    // Back again: the first page is whole, not what was left of the second.
    await app.page.click('[data-testid="page-prev"]')
    await expect(app.page.locator('[data-testid="page-label"]')).toContainText('Page 1 of 2')
    expect(await rows.count()).toBe(15)
  })

  test('an empty ranking says so, and a failing one offers a retry that retries', async ({
    app,
  }) => {
    await app.open({ scenario: 'empty' })
    await app.openLog('ranking')
    await expect(app.page.locator('[data-testid="query-empty"]')).toBeVisible()

    await app.open({ scenario: 'ranking-fails' })
    await app.openLog('ranking')
    await expect(app.page.locator('[data-testid="query-error"]')).toBeVisible({ timeout: 30_000 })

    const retry = app.page.locator('[data-testid="query-retry"]')
    await expect(retry).toBeVisible()

    const before = (await app.apiCalls())['get /ranking'] ?? 0
    await retry.click()
    await expect
      .poll(async () => (await app.apiCalls())['get /ranking'] ?? 0)
      .toBeGreaterThan(before)
  })

  test('the history is empty for a player who has registered nothing', async ({ app }) => {
    await app.open()
    await app.openLog('history')
    await expect(app.page.locator('[data-testid="query-empty"]')).toBeVisible()
    await expect(app.page.locator('[data-testid="history-row"]')).toHaveCount(0)
    await expect(app.page.locator('[data-testid="log-subtitle"]')).toContainText('Captain')
  })
})
