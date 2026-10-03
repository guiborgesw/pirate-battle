import { expect, test } from './fixtures.ts'

test.describe('asset loading', () => {
  test('a healthy load shows progress and reaches the menu', async ({ app }) => {
    await app.open()
    await app.waitForMenu()

    await expect(app.page.locator('[data-testid="play"]')).toBeEnabled()
    await expect(app.page.locator('[data-testid="options"]')).toBeEnabled()
    // The loading screen is gone, not merely covered.
    await expect(app.page.getByRole('progressbar')).toHaveCount(0)
  })

  test('a failed load says so and retries into the game', async ({ app }) => {
    await app.open({ assets: 'missing' })

    // The first attempt is blocked: the failure is announced with a way out.
    await expect(app.page.locator('[role="alert"]')).toBeVisible({ timeout: 30_000 })
    const retry = app.page.getByRole('button', { name: 'Retry' })
    await expect(retry).toBeVisible()

    // Retrying is a real second attempt, and it lands on the menu.
    await retry.click()
    await app.waitForMenu()
    await expect(app.page.locator('[data-testid="play"]')).toBeVisible()
  })
})
