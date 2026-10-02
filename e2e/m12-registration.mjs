import { chromium } from '@playwright/test'

const BASE = 'http://localhost:4173'
const results = {}
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()

/** A clean origin: no mock database, no queue, no remembered scenario. */
async function fresh(query) {
  await page.goto(`${BASE}/?testHooks=1`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${BASE}/?testHooks=1${query}`)
  await page.waitForSelector('[data-testid="play"]')
}

async function playMatch(seconds) {
  await page.click('[data-testid="play"]')
  await page.waitForTimeout(2500)
  await page.evaluate((value) => {
    window.__pb.setSeed(1)
    window.__pb.useManualClock()
    window.__pb.advance(value * 1000)
  }, seconds)
  await page.waitForSelector('[data-testid="result-registration"]', { timeout: 15000 })
}

const queueLength = () =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pb.pending.v1') ?? '{}')).length)
const dbLength = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pb.mockdb.v1') ?? '[]').length)

// ── 1. timeout-after-save: stored before the request, one record after repeated retries ────────────
await fresh('&scenario=timeout-after-save')
await playMatch(125)

results.um_statusInicial = await page.textContent('[data-testid="result-registration"]')
results.um_naFila = await queueLength()
results.um_bancoInicial = await dbLength()

await page.waitForSelector('[data-testid="retry-registration"]', { timeout: 25000 })
results.um_statusAposTimeout = await page.textContent('[data-testid="result-registration"]')

for (let attempt = 0; attempt < 5; attempt += 1) {
  await page.click('[data-testid="retry-registration"]')
  await page.waitForTimeout(6500)
}

results.um_retriesFeitos = 5
results.um_bancoAposRetries = await dbLength()
results.um_filaAposRetries = await queueLength()
results.um_statusAposRetries = await page.textContent('[data-testid="result-registration"]')

// The network comes back: switch the scenario in the panel (the reviewer's own path) and let the
// `online` event flush whatever is waiting.
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true }))
})
await page.waitForSelector('[data-testid="mock-scenario"]')
await page.selectOption('[data-testid="mock-scenario"]', 'success')
await page.evaluate(() => {
  window.dispatchEvent(new Event('online'))
})
await page.waitForTimeout(3500)

results.um_filaAposRecuperar = await queueLength()
results.um_bancoAposRecuperar = await dbLength()
results.um_statusAposRecuperar = await page.textContent('[data-testid="result-registration"]')
await page.click('[data-testid="main-menu"]')
await page.waitForSelector('[data-testid="last-result"]')
results.um_ultimoResultado = await page.textContent('[data-testid="last-result"]')

// Both tabs show it, exactly once.
await page.click('[data-testid="tab-ranking"]')
await page.waitForSelector('[data-testid="ranking-row"]')
results.um_paginasRanking = await page.textContent('[data-testid="page-label"]')
let voce = await page.locator('[data-testid="ranking-row"]', { hasText: 'You' }).count()
if (voce === 0) {
  await page.click('[data-testid="page-next"]')
  await page.waitForTimeout(1500)
  voce = await page.locator('[data-testid="ranking-row"]', { hasText: 'You' }).count()
}
results.um_linhasComVoce = voce
await page.click('[data-testid="tab-history"]')
await page.waitForTimeout(1500)
results.um_linhasHistorico = await page.locator('[data-testid="history-row"]').count()

// ── 2. offline-at-end: a new match while pending, then recovery after a reload ────────────────────
await fresh('&scenario=offline-at-end')
await playMatch(65)

results.dois_status = await page.textContent('[data-testid="result-registration"]')
await page.waitForSelector('[data-testid="retry-registration"]', { timeout: 25000 })
results.dois_statusAposFalha = await page.textContent('[data-testid="result-registration"]')
results.dois_filaComUmPendente = await queueLength()

// "Starting a new match while pending works": play again with the previous match still waiting.
await page.click('[data-testid="play-again"]')
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.__pb.setSeed(1)
  window.__pb.useManualClock()
  window.__pb.advance(65000)
})
await page.waitForSelector('[data-testid="result-registration"]', { timeout: 15000 })
await page.waitForTimeout(2000)
results.dois_filaComDoisPendentes = await queueLength()
results.dois_bancoComDoisPendentes = await dbLength()

// Reload with a queued match, then bring the network back and let the boot/online flush drain both.
await page.reload()
await page.waitForSelector('[data-testid="play"]')
await page.waitForTimeout(1500)
results.dois_filaAposReload = await queueLength()

await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true }))
})
await page.waitForSelector('[data-testid="mock-scenario"]')
await page.selectOption('[data-testid="mock-scenario"]', 'success')
await page.evaluate(() => {
  window.dispatchEvent(new Event('online'))
})
await page.waitForTimeout(4000)

results.dois_filaAposRecuperar = await queueLength()
results.dois_bancoAposRecuperar = await dbLength()
await page.click('[data-testid="tab-history"]')
await page.waitForTimeout(2000)
results.dois_linhasHistorico = await page.locator('[data-testid="history-row"]').count()
await page.click('[data-testid="tab-ranking"]')
await page.waitForTimeout(2000)
results.dois_paginasRanking = await page.textContent('[data-testid="page-label"]')

await browser.close()
console.log(JSON.stringify(results, null, 2))
