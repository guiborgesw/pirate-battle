import { expect, test } from './fixtures.ts'

test.describe('options', () => {
  test('the menu explains the controls and the options screen changes and remembers them', async ({
    app,
  }) => {
    await app.open()
    await app.waitForMenu()

    // The controls help the spec asks for.
    await expect(app.page.getByText('Forward')).toBeVisible()
    await expect(app.page.getByText('Bow gun')).toBeVisible()
    await expect(app.page.getByText('Broadsides')).toBeVisible()
    await expect(app.page.getByText('P / Esc')).toBeVisible()

    await app.page.click('[data-testid="options"]')
    await expect(app.page.getByRole('heading', { name: 'Options' })).toBeVisible()

    // Two steps up from the default, then down to the floor.
    expect(await app.optionValue('durationSec')).toBe(120)
    await app.page.click('[data-testid="option-durationSec-plus"]')
    await app.page.click('[data-testid="option-durationSec-plus"]')
    expect(await app.optionValue('durationSec')).toBe(122)

    await app.setOption('durationSec', 60)

    // The floor holds: pressing down again changes nothing.
    await app.page.click('[data-testid="option-durationSec-minus"]')
    await app.page.click('[data-testid="option-durationSec-minus"]')
    expect(await app.optionValue('durationSec')).toBe(60)

    // And what was set survives a reload.
    await app.page.click('[data-testid="options-back"]')
    await app.page.reload()
    await app.waitForMenu()
    await app.page.click('[data-testid="options"]')
    expect(await app.optionValue('durationSec')).toBe(60)
  })

  test('stored options that make no sense are refused with an announced reason', async ({
    app,
  }) => {
    await app.open()
    await app.page.evaluate(() => {
      localStorage.setItem(
        'pb.options.v1',
        JSON.stringify({ durationSec: 9999, spawnIntervalMs: 33 }),
      )
    })
    await app.page.reload()
    await app.waitForMenu()
    await app.page.click('[data-testid="options"]')

    // The impossible pair is replaced by the defaults and the screen says why, accessibly.
    await expect(app.page.locator('[data-testid="options-warning"]')).toBeVisible()
    expect(await app.optionValue('durationSec')).toBe(120)
    expect(await app.optionValue('spawnIntervalMs')).toBe(3)
  })

  test('the spawn interval stays inside its bounds and the sound toggle is remembered', async ({
    app,
  }) => {
    await app.open()
    await app.waitForMenu()
    await app.page.click('[data-testid="options"]')

    expect(await app.optionValue('spawnIntervalMs')).toBe(3)
    await app.setOption('spawnIntervalMs', 10)

    // The ceiling holds.
    await app.page.click('[data-testid="option-spawnIntervalMs-plus"]')
    await app.page.click('[data-testid="option-spawnIntervalMs-plus"]')
    expect(await app.optionValue('spawnIntervalMs')).toBe(10)

    // The sound switch is a device setting, and it survives too.
    const sound = app.page.locator('[data-testid="toggle-sound"]')
    const before = await sound.getAttribute('aria-pressed')
    await sound.click()
    const after = await sound.getAttribute('aria-pressed')
    expect(after).not.toBe(before)

    await app.page.reload()
    await app.waitForMenu()
    await app.page.click('[data-testid="options"]')
    expect(await app.optionValue('spawnIntervalMs')).toBe(10)
    await expect(app.page.locator('[data-testid="toggle-sound"]')).toHaveAttribute(
      'aria-pressed',
      after ?? 'false',
    )
  })
})
