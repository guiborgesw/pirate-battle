/**
 * M13's scope, measured: touch controls driving the ship, the portrait notice pausing the match, and the
 * HUD staying inside a 640x360 landscape viewport.
 *
 * Run the built app first:
 *   pnpm preview
 *   node e2e/m13-mobile.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:4173'
const results = {}
const browser = await chromium.launch({ channel: 'msedge' })
const context = await browser.newContext({ viewport: { width: 640, height: 360 } })
const page = await context.newPage()

await page.goto(`${BASE}/?touch=1&testHooks=1&scenario=success`)
await page.evaluate(() => {
  localStorage.clear()
  sessionStorage.clear()
})
await page.goto(`${BASE}/?touch=1&testHooks=1&scenario=success`)
await page.waitForSelector('[data-testid="play"]')

// ── 1. The touch controls are offered, and nothing is clipped ───────────────────────────────────────
await page.click('[data-testid="play"]')
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.__pb.setSeed(1)
  window.__pb.useManualClock()
})

results.controlesVisiveis = (await page.locator('[data-testid="touch-controls"]').count()) === 1
results.hudDentroDaTela = await page.evaluate(() => {
  const hud = document.querySelector('[data-testid="hud-announcement"]')?.parentElement
  if (!hud) return 'sem hud'
  const box = hud.getBoundingClientRect()
  const inside =
    box.left >= 0 &&
    box.top >= 0 &&
    box.right <= window.innerWidth + 0.5 &&
    box.bottom <= window.innerHeight
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    box: [box.left, box.top, box.width, box.height].map(Math.round),
    inside,
  }
})
results.stickDentroDaTela = await page.evaluate(() => {
  const stick = document.querySelector('[data-testid="touch-stick"]')
  if (!stick) return 'sem stick'
  const box = stick.getBoundingClientRect()
  return {
    box: [box.left, box.top, box.width, box.height].map(Math.round),
    inside: box.bottom <= window.innerHeight + 0.5 && box.right <= window.innerWidth + 0.5,
  }
})

// ── 2. The stick actually sails the ship ────────────────────────────────────────────────────────────
const before = await page.evaluate(() => window.__pb.getState())
await page.mouse.move(60, 300)
await page.mouse.down()
await page.mouse.move(60, 250, { steps: 4 })
await page.evaluate(() => window.__pb.advance(1500))
const sailing = await page.evaluate(() => window.__pb.getState())
await page.mouse.up()
await page.evaluate(() => window.__pb.advance(1500))
const released = await page.evaluate(() => window.__pb.getState())

results.navioAndouComOStick = Math.abs(sailing.player.y - before.player.y) > 20
results.deslocamentoY = Math.round(sailing.player.y - before.player.y)
results.parouAoSoltar = Math.abs(released.player.y - sailing.player.y) < 60

// ── 3. A gun button fires, without touching the stick ───────────────────────────────────────────────
const shotsBefore = await page.evaluate(() => window.__pb.getShotsFired())
await page.mouse.move(600, 320)
await page.mouse.down()
await page.evaluate(() => window.__pb.advance(400))
await page.mouse.up()
await page.evaluate(() => window.__pb.advance(400))
results.tirosAntes = shotsBefore
results.tirosDepois = await page.evaluate(() => window.__pb.getShotsFired())
results.tiroDisparou = results.tirosDepois > shotsBefore

// ── 4. Portrait asks for a turn and stops the clock ─────────────────────────────────────────────────
await page.setViewportSize({ width: 360, height: 640 })
await page.waitForTimeout(500)
results.avisoDeRetrato = (await page.locator('[data-testid="portrait-overlay"]').count()) === 1
const pausado = await page.evaluate(() => window.__pb.getState())
results.parouEmRetrato = pausado.status === 'paused'
const restanteAntes = pausado.remainingMs
await page.waitForTimeout(1200)
results.relogioCongelado =
  (await page.evaluate(() => window.__pb.getRemainingMs())) === restanteAntes

await page.setViewportSize({ width: 640, height: 360 })
await page.waitForTimeout(500)
results.avisoSumiu = (await page.locator('[data-testid="portrait-overlay"]').count()) === 0
results.continuaPausadoDepoisDoGiro =
  (await page.evaluate(() => window.__pb.getState())).status === 'paused'

await browser.close()
console.log(JSON.stringify(results, null, 2))
