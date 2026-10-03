/**
 * M13's acceptance (plan): an axe scan of the menu, the options screen and the result screen, with no
 * serious or critical violations. `@axe-core/playwright` is a dev dependency for exactly this.
 *
 * Run the built app first:
 *   pnpm preview
 *   node e2e/m13-axe.mjs
 */
import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:4173'
const browser = await chromium.launch({ channel: 'msedge' })
// AxeBuilder insists on an explicit context rather than `browser.newPage()`.
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()

const results = {}

async function scan(name) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  results[name] = {
    violations: report.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      help: violation.help,
    })),
    serious: report.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ).length,
    passes: report.passes.length,
  }
}

async function fresh(query) {
  await page.goto(`${BASE}/?testHooks=1`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${BASE}/?testHooks=1${query}`)
  await page.waitForSelector('[data-testid="play"]')
}

// 1. The menu, with a finished match from a previous visit on it.
await fresh('')
await page.click('[data-testid="play"]')
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.__pb.setSeed(1)
  window.__pb.useManualClock()
  window.__pb.advance(65000)
})
await page.waitForSelector('[data-testid="result-registration"]')
await scan('result')

await page.click('[data-testid="main-menu"]')
await page.waitForSelector('[data-testid="play"]')
await scan('menu')

// 2. The options screen.
await page.click('[data-testid="options"]')
await page.waitForSelector('[data-testid="options-back"]', { timeout: 10000 })
await page.waitForTimeout(400)
await scan('options')

// 3. The Captain's log, both tabs (more surface than the plan asks for; cheap to cover).
await page.click('[data-testid="options-back"]').catch(() => {})
await page.waitForTimeout(300)
await page.click('[data-testid="tab-ranking"]')
await page.waitForSelector('[data-testid="ranking-row"]', { timeout: 10000 })
await scan('ranking')

await page.click('[data-testid="tab-history"]')
await page.waitForTimeout(1200)
await scan('history')

// 4. The paused arena, which is where the dialog and the HUD live.
await page.click('[data-testid="log-back"]')
await page.waitForSelector('[data-testid="play"]')
await page.click('[data-testid="play"]')
await page.waitForTimeout(2500)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await scan('paused-arena')

await browser.close()
console.log(JSON.stringify(results, null, 2))
