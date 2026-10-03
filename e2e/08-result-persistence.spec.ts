import { expect, test } from './fixtures.ts'

test.describe('the result screen', () => {
  test('it shows what happened, and the menu still knows after a refresh', async ({ app }) => {
    await app.open()
    await app.waitForMenu()
    await expect(app.page.locator('[data-testid="last-result"]')).toContainText(
      'No finished match yet',
    )

    await app.play()
    await app.hold('Space', 120)
    await app.finishByDeath()

    const score = (
      (await app.page.locator('[data-testid="result-score"]').textContent()) ?? ''
    ).trim()
    await expect(app.page.locator('[data-testid="result-meta"]')).toContainText('HULL SUNK')
    await expect(app.page.locator('[data-testid="result-registration"]')).toBeVisible()

    // A refresh does not forget the match.
    await app.page.reload()
    await app.waitForMenu()
    const last = (await app.page.locator('[data-testid="last-result"]').textContent()) ?? ''
    expect(last).toContain(score)
    expect(last).toContain('Hull sunk')

    // But the result screen itself is not a place you can navigate back to.
    await expect(app.page.locator('[data-testid="result-score"]')).toHaveCount(0)
  })
})
