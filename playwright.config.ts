import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * The suite runs against the *built* app, which is what the challenge asks for: the same artefact that
 * gets deployed, with the mocks active.
 *
 * Two deliberate choices, both recorded in `docs/plan-deviations.md` §K:
 * - the system's Edge/Chrome is used (`channel`) instead of downloading a Playwright Chromium build;
 * - one worker, because the specs drive a real simulation and a shared preview server, and a suite that
 *   passes twice in a row matters more here than one that finishes early.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  // Baselines are per project: a 1280x720 desktop frame and a Pixel 7 landscape frame are not the same
  // picture, and pretending otherwise would make the visual tests lie.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',

  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Every spec starts from a fresh context, so local storage and the mock database begin empty.
    storageState: undefined,
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7 landscape'], channel: 'msedge' },
    },
  ],

  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 240_000,
  },
})
