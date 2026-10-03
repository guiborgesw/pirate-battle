import { expect, test } from './fixtures.ts'

/**
 * Visual regression for the three screens the challenge names: the menu, the arena in a stable seeded
 * state, and the result.
 *
 * Baselines live in `e2e/__screenshots__/<project>/` and are per project on purpose — a 1280x720 desktop
 * frame and a Pixel 7 landscape frame are different pictures, and one baseline pretending to cover both
 * would only ever be right for one of them.
 *
 * What could drift is masked rather than tolerated: the match clock, which is the one thing on screen
 * whose value depends on how long the browser took to get here.
 */
test.describe('visual regression', () => {
  /**
   * Waits for every `<img>` on the page to finish decoding.
   *
   * A screenshot taken while the wooden panel, the banner or the control icons are still decoding is a
   * screenshot of a different page — which is exactly the kind of baseline mismatch that reads as a
   * regression and is not one.
   */
  const settleImages = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete))
  }

  test('the menu', async ({ app }) => {
    await app.open()
    await app.waitForMenu()
    await settleImages(app.page)
    await expect(app.page).toHaveScreenshot('menu.png')
  })

  test('the arena after two seconds of a seeded match', async ({ app }) => {
    await app.open()
    await app.play()
    await app.advance(2000)
    await settleImages(app.page)

    await expect(app.page).toHaveScreenshot('arena.png', {
      mask: [app.page.locator('[data-testid="hud-time"]')],
    })
  })

  test('the result screen', async ({ app }) => {
    await app.open()
    await app.play()
    await app.hold('Space', 120)
    await app.advance(65_000)
    await app.page.waitForSelector('[data-testid="result-score"]')

    // Wait for the registration line to settle: "Registering…" and "Registered" are different pictures.
    await expect(app.page.locator('[data-testid="result-registration"]')).toContainText(
      'Registered',
      {
        timeout: 30_000,
      },
    )

    await settleImages(app.page)
    await expect(app.page).toHaveScreenshot('result.png')
  })
})
