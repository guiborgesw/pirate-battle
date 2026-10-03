import { expect, test } from './fixtures.ts'

test.describe('pause', () => {
  // The clock the player reads is the HUD's text, so that is what these tests measure. Reading the
  // snapshot instead would test the instrument rather than the screen.
  const clockText = (app: { page: import('@playwright/test').Page }) =>
    app.page.locator('[data-testid="hud-time"]').textContent()

  test('pausing freezes the clock and resuming picks it up again', async ({ app }) => {
    await app.open()
    await app.play()
    await app.advance(2000)
    expect((await app.state()).status).toBe('running')

    const dialog = app.page.locator('[data-testid="pause-dialog"]')
    await app.page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    // Twenty simulated seconds pass with the clock standing still.
    const frozen = await clockText(app)
    await app.advance(20_000)
    expect(await clockText(app)).toBe(frozen)

    await app.page.click('[data-testid="resume"]')
    await expect(dialog).toHaveCount(0)
    await app.advance(3000)
    expect(await clockText(app)).not.toBe(frozen)
    expect((await app.state()).status).toBe('running')
  })

  test('losing the window focus pauses the match, and the keyboard can leave the dialog', async ({
    app,
  }) => {
    await app.open()
    await app.play()
    await app.advance(1000)

    await app.page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
    })

    const dialog = app.page.locator('[data-testid="pause-dialog"]')
    await expect(dialog).toBeVisible()

    const frozen = await clockText(app)
    await app.advance(6000)
    expect(await clockText(app)).toBe(frozen)

    // Escape leaves the pause: the key that resumed must not be re-read as a game key.
    await app.page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await app.advance(2000)
    expect(await clockText(app)).not.toBe(frozen)
  })
})
