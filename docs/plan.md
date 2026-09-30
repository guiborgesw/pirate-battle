<!-- Original implementation brief, kept verbatim for traceability.
     Corrections that this repository applies to it are listed in docs/plan-deviations.md.
     Where this brief and the challenge spec disagree, the spec wins. -->

# Implementation Plan: Pirate Battle (agent brief)

Spec: https://github.com/junglegaming/game-developer-challenge (README.md). The spec is the source of truth; this plan fixes the decisions the spec leaves open so you can implement without asking. If this plan contradicts the spec, follow the spec and note the deviation in `ARCHITECTURE.md`.

## 0. Operating rules

- Work milestone by milestone, in order. Do not start milestone N+1 until milestone N's acceptance checks pass.
- After every milestone run: `pnpm typecheck && pnpm lint && pnpm build`. From M13 on, also `pnpm test:e2e`. Fix failures before moving on.
- One commit per milestone, message `M<n>: <title>`. Never commit a red build.
- All code, identifiers, UI copy and docs in English.
- No `any`, no `@ts-ignore`, no non-null assertions without a comment explaining the invariant.
- The simulation (`src/game/sim`, `src/game/core`) must not import `pixi.js`, `react`, or touch `window`/`document`. Enforce with an ESLint `no-restricted-imports` rule in those folders.
- Never use `Date.now()`, `performance.now()` or `Math.random()` inside the simulation. Use the injected `Clock` and `Rng`.
- Do not add dependencies beyond those listed in 1.1 without writing the reason in `ARCHITECTURE.md`.
- Stop and report (do not improvise) only if: an asset required by the spec is missing or unreadable, or a required tool cannot run in the environment.

## 1. Locked decisions

### 1.1 Stack

- Vite + React 18 + TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `pixi.js` v8, `@tanstack/react-query` v5, `axios`, `msw` v2, `@playwright/test`.
- Package manager: pnpm. Styling: CSS Modules. No global state library: a tiny typed store + `useSyncExternalStore`.
- Screen routing: a `screen` state in React (`menu | options | game | result`). No router library.

### 1.2 Directory layout

```
src/
  config/        gameConfig.ts, optionsSchema.ts
  game/
    core/        FixedStepLoop.ts, Clock.ts, Rng.ts (mulberry32), EventBus.ts, math.ts
    sim/         World.ts, entities.ts, systems/{movement,weapons,projectiles,collision,ai,spawn,match}.ts
    render/      Renderer.ts, views/{ShipView,ProjectileView,IslandView,HealthBar,Fx}.ts, pools.ts
    input/       InputState.ts, KeyboardInput.ts, TouchInput.ts
    assets/      manifest.ts, loadAssets.ts
    GameSession.ts   (wires sim + render + input + loop; the only object React talks to)
    testHooks.ts
  ui/            screens/*, components/*, hud/*, store/sessionStore.ts
  api/           contracts.ts, client.ts, queries.ts, pendingRegistrations.ts
  mocks/         browser.ts, handlers.ts, db.ts, fixtures.ts, scenarios.ts
  storage/       localStore.ts (versioned keys, try/catch on every access)
e2e/             *.spec.ts, fixtures.ts
scripts/         convert-kenney-xml.ts
public/assets/   copied from the challenge repo + converted atlas JSON
```

### 1.3 Simulation model

- Fixed timestep `STEP_MS = 1000/60`. Accumulate ticker `deltaMS`, clamp a single frame to 250 ms, run N steps, render once with interpolation alpha.
- World units = pixels of a fixed logical arena `1280x720`. The renderer scales the stage to fit the viewport (letterbox) at `resolution = devicePixelRatio`. Input and bounds use logical units only.
- Entities are plain objects in arrays owned by `World`: `{ id, kind, x, y, rotation, radius, hp, maxHp, alive, ... }`. Systems are pure functions `(world, dt, ctx) => void`.
- Colliders: every ship and projectile is a circle. Islands are a list of circles (compose a larger island from 2-4 circles). Ship vs island: resolve by pushing the ship out along the normal and zeroing the inward velocity.
- Removal: set `alive = false` during the step; a single `compact()` at the end of the step removes dead entities and emits `entityRemoved` events. A projectile that hits sets `alive = false` immediately so it cannot apply damage twice in the same step.
- Enemy steering: seek the player; if the forward probe (ray of length 2x radius) hits an island, rotate toward the side with more clearance. No pathfinding.
- Chaser contact: damage player, kill chaser, `killedBy = 'self'` (no score). Score +1 only when `killedBy = 'player'`.
- Spawn: every `spawnIntervalMs`, pick up to 30 random candidates on the arena edge band; accept the first with no island overlap and distance to player ≥ `spawn.minDistanceFromPlayer`. Type chosen by weighted `spawn.weights`. Guarantee at least one Chaser and one Shooter in the first two spawns.

### 1.4 Game config

`src/config/gameConfig.ts` exports `GameConfig` (type) and `DEFAULT_CONFIG`. Every tunable number lives here, including:

```ts
type GameConfig = {
  match: { durationSec: number } // 60..180
  spawn: {
    intervalMs: number
    weights: { chaser: number; shooter: number }
    minDistanceFromPlayer: number
    maxAlive: number
  }
  player: ShipStats & {
    weapons: { front: WeaponStats; side: WeaponStats & { spread: number; count: 3 } }
  }
  chaser: ShipStats & { contactDamage: number }
  shooter: ShipStats & { weapon: WeaponStats; attackRange: number; preferredRange: number }
}
type ShipStats = { maxHp: number; speed: number; turnSpeedRad: number; radius: number }
type WeaponStats = { damage: number; cooldownMs: number; projectileSpeed: number; rangePx: number }
```

- Option bounds (documented in README): `durationSec` 60..180 integer, default 120; `spawnIntervalMs` 1000..10000 step 500, default 3000.
- `createMatchConfig(options): Readonly<GameConfig>` deep-freezes a snapshot at match start. Systems read only the snapshot.
- `configKey(config)`: stable string `d<duration>-s<interval>` used to group ranking entries.

### 1.5 React <-> game boundary

- `GameSession` API: `static create(opts: { canvasHost: HTMLElement; config; seed; assets }) : GameSession`, `start()`, `pause(reason)`, `resume()`, `destroy()`, `subscribe(listener)`, `getSnapshot(): HudSnapshot`.
- `HudSnapshot = { status: 'running'|'paused'|'ended'; score; remainingSec (integer); playerHp; endReason?: 'time'|'death' }`. A new snapshot object is emitted only when one of those fields changes. React never reads the world directly.
- `<GameScreen>` creates the session in `useEffect` and calls `destroy()` in cleanup. It must survive React Strict Mode double mount (guard with an `aborted` flag while async asset loading is in progress).
- `destroy()` stops the ticker, removes all DOM/window listeners, destroys the Pixi app with `{ children: true }` but keeps cached textures, clears timers, empties pools.

### 1.6 Pause

- Triggers: `P`/`Escape` key, pause button, `window.blur`, `document.visibilitychange` hidden.
- While paused: loop does not step, clock does not advance, cooldowns frozen.
- Resume only via explicit user action (button or key) in the pause dialog. On resume: clear `InputState`, reset the loop accumulator, drop the next frame delta.

### 1.7 Input

- `InputState` holds booleans for intents: `forward, rotateLeft, rotateRight, fireFront, fireLeft, fireRight`.
- Keyboard: `W/ArrowUp` forward, `A/ArrowLeft` and `D/ArrowRight` rotate, `Space` front, `Q` left broadside, `E` right broadside, `P/Escape` pause. Listeners are attached only while status is `running`; `preventDefault` only for these keys.
- Touch: on-screen buttons (React, pointer events, multi-touch) writing to the same `InputState`. Supported mobile orientation: landscape; show a "rotate device" overlay in portrait.

### 1.8 Remote data contracts

```ts
type EndReason = 'time' | 'death'
type MatchRecord = {
  matchId: string // uuid v4, generated at match start; idempotency key
  playerId: string // uuid persisted in localStorage on first launch
  playerName: string
  playedAt: string // ISO
  score: number
  durationMs: number // effective active time
  endReason: EndReason
  config: { durationSec: number; spawnIntervalMs: number; key: string }
}
type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
type RankingEntry = MatchRecord & { rank: number }
```

Endpoints (base `/api`):

- `GET /ranking?configKey&page&pageSize` → `Page<RankingEntry>`. Order: score desc, durationMs asc, playedAt asc, matchId asc.
- `GET /players/:playerId/matches?page&pageSize` → `Page<MatchRecord>`, playedAt desc.
- `PUT /matches/:matchId` body `MatchRecord` → `201` created or `200` with the existing record. Never duplicates.

Query keys: `['ranking', configKey, page]`, `['history', playerId, page]`. Use `placeholderData: keepPreviousData`, `staleTime: 10_000`, `retry: 2` for GETs, `refetchOnWindowFocus: true`, refetch on tab mount. Axios timeout 5000 ms, pass the TanStack `signal` to axios so superseded requests are aborted (prevents stale overwrite).

### 1.9 Pending registrations

- On match end (not abandon), write the `MatchRecord` to `localStorage['pb.pending.v1']` (map by matchId) **before** the request.
- `useRegisterMatch` = `useMutation` calling `PUT`. On success: remove from pending, `invalidateQueries(['ranking'])` and `(['history'])`. On failure: keep pending, expose `status` to the Result screen with a Retry button.
- On app boot and on `online` event: flush all pending sequentially.
- Result screen shows registration state: `pending | saving | saved | failed`.
- Abandon (leave game screen or reload mid-match): nothing is written.

### 1.10 MSW

- `mocks/db.ts`: in-memory store hydrated from `localStorage['pb.mockdb.v1']` + fixtures; persisted after every write.
- Fixtures: 40 records from 12 fake players across 3 config keys (enough for multiple pages).
- Worker started in `main.tsx` before `createRoot().render`, in **all** builds including production (`serviceWorker.url` relative to `import.meta.env.BASE_URL`). `onUnhandledRequest: 'bypass'`.
- Scenario selection: `?scenario=<name>` (persisted in `sessionStorage`) plus a small dev panel (toggle `Shift+D`) with a select and "Reset mock data".
- Scenarios: `success`, `empty`, `many-pages`, `slow` (2 s), `variable-latency` (seeded 100..1500 ms), `out-of-order` (older requests resolve later), `timeout` (never resolves before 6 s), `network-error` (`HttpResponse.error()`), `http-400`, `http-500`, `ranking-fails`, `history-fails`, `timeout-after-save` (persists record, then delays response past timeout), `offline-at-end` (PUT fails until scenario changes).
- Randomness in mocks uses `Rng` seeded from `?seed=` (default 1).

### 1.11 Test hooks

When `import.meta.env.MODE === 'test'` or `?testHooks=1`, expose `window.__pb`:

```ts
{
  getState(): { status; score; remainingMs; player: { x; y; rotation; hp }; enemies: Array<{ id; kind; x; y; hp }>; projectiles: number };
  setSeed(n: number): void;         // before Play
  useManualClock(): void;           // loop only steps via advance()
  advance(ms: number): void;        // runs real systems in fixed steps
  spawnEnemy(kind, x, y): void;     // for deterministic combat tests
}
```

Hooks observe and drive time only. Inputs in tests go through `page.keyboard` / pointer events.

## 2. Milestones

Each milestone lists tasks, then **Accept** (must be true before committing).

### M1: Scaffold and deploy

- Vite React TS project, pnpm, strict tsconfig, ESLint (typescript-eslint strict + react-hooks + import restrictions from §0), Prettier.
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test:e2e`, `test:e2e:update`.
- Copy challenge `assets/` into `public/assets/`.
- `vercel.json` with SPA fallback. Placeholder screen.
- **Accept:** all scripts run; `pnpm build && pnpm preview` serves the page.

### M2: Config and storage

- Implement §1.4 and `storage/localStore.ts` (versioned, schema-validated reads, fallback to defaults on corrupt data).
- **Accept:** unit-free check via typecheck; grep shows no numeric gameplay literals in `src/game/sim`.

### M3: Assets

- `scripts/convert-kenney-xml.ts` converts `ships_miscellaneous_sheet(.retina).xml` to Pixi spritesheet JSON; commit output.
- `manifest.ts` bundles: ships atlas, tiles sheet, UI atlas, sounds. `loadAssets(onProgress)` loads once and caches; on failure rejects with a typed error listing failed keys.
- Loading screen with progress bar and Retry on failure.
- **Accept:** blocking a texture URL in DevTools shows the error + Retry; unblocking and Retry succeeds without reload.

### M4: Pixi host and loop

- `Renderer` (Pixi `Application.init`, resize to host with letterbox, DPR), `FixedStepLoop`, `Clock`, `GameSession` skeleton, `<GameScreen>`.
- Render water tiles across the 1280x720 arena.
- **Accept:** Strict Mode on; enter/leave game screen 10x: no console errors, one canvas in the DOM, listener count stable.

### M5: Player movement and islands

- Input (§1.7 keyboard), movement system, arena bounds, 3 islands built from circles and drawn from tiles, ship-island collision.
- **Accept:** cannot leave arena or enter an island; speed identical with throttled CPU (DevTools 6x) vs normal.

### M6: Weapons and projectiles

- Front (1) and broadside left/right (3 parallel, perpendicular to heading), cooldowns, range/lifetime, pooling, removal rules from §1.3.
- **Accept:** holding fire respects cooldown; projectiles vanish on island contact and at arena edge.

### M7: Enemies, spawn, scoring

- Chaser and Shooter per §1.3, health system, spawn system, scoring, `killedBy`.
- Health bars above every ship (Pixi Graphics, reused).
- **Accept:** in a 120 s match both enemy types appear; chaser self-destruct does not add score; killed enemies stop firing immediately.

### M8: Match rules, HUD, pause

- Match system: countdown by sim clock, end by time or death, freeze everything on end.
- `sessionStore` + `useSyncExternalStore` HUD (score, time, hp) in React overlay. Verify with React DevTools Profiler that HUD re-renders ≤ ~1/s plus on score/hp changes.
- Pause per §1.6 with an accessible dialog (focus trap, Escape handled).
- Restart = `destroy()` + new session.
- **Accept:** pause 20 s then resume: remaining time unchanged ±1 step; after end, pressing fire does nothing.

### M9: Screens and options

- Menu (Play, Options, controls help, tabs Ranking / Match History placeholders), Options form (validation, inline accessible errors, save, persists), Result screen (score, time played, end reason, registration status, Play Again, Main Menu), last result persisted and shown after refresh.
- Menu styling using `ui_sheet` sprites and `ui_scene_background.png`; match reference images in `assets/sample_*.png`.
- **Accept:** invalid values cannot be saved; options and last result survive reload; reload during a match returns to menu with nothing recorded.

### M10: Feedback and audio

- Muzzle smoke, hit splash/flash, explosion, damaged hull sprite swaps at 66% and 33% hp, low-health sound, time warning at 10 s. Mute toggle persisted.
- **Accept:** every hit produces visible feedback; no audio errors when the tab lacks user gesture (unlock audio on first interaction).

### M11: API layer and tabs

- §1.8 contracts, axios client, query hooks, Ranking tab (filter by current config key, pagination, loading/empty/error states with retry) and Match History tab (same states).
- §1.10 MSW with `success`, `empty`, `many-pages` scenarios first.
- **Accept:** works identically in `pnpm dev` and `pnpm preview`; tabs refetch when re-shown.

### M12: Registration and network scenarios

- §1.9 pending flow, idempotent PUT, invalidation of both tabs.
- Remaining scenarios from §1.10, dev panel, reset.
- **Accept:** with `timeout-after-save`, Retry 5x results in exactly one record in both tabs; with `offline-at-end`, reload, switch to `success`, record appears once; starting a new match while pending works.

### M13: Mobile and accessibility

- Touch controls (§1.7), portrait overlay, responsive layout for 360x640 landscape up to desktop, HUD never clipped.
- Keyboard-navigable menus, visible focus, labels, WCAG AA contrast, `aria-live="polite"` region announcing score changes and time every 30 s and at 10 s, status changes.
- Keys captured only while `running`.
- **Accept:** axe scan (via `@axe-core/playwright`, dev dependency allowed) has no serious violations on menu, options, result.

### M14: Playwright suite

- Config: projects `desktop-chromium` and `mobile-chromium` (Pixel 7 landscape), `reporter: [['html'], ['list']]`, `trace: 'retain-on-failure'`, `webServer` runs `pnpm build && pnpm preview`.
- Each test: fresh context, `localStorage` cleared, `?testHooks=1&seed=1&scenario=<x>`, manual clock.
- Files map 1:1 to spec §8 items 1-12 (`01-options.spec.ts` ... `12-retry-and-stale.spec.ts`).
- Visual regression: menu, arena in a stable seeded state after `advance(2000)`, result screen. Commit baselines under `e2e/__screenshots__`. Mask anything time-dependent.
- **Accept:** `pnpm test:e2e` green twice in a row; intentionally breaking a collision rule makes a test fail.

### M15: Performance

- `?perf=1` overlay recording frame times; on match end dump `{ avgFps, p95FrameMs, maxEntities }` to console and a downloadable JSON.
- Run a 180 s match on production build; run 5 start/play/exit cycles and take heap snapshots before/after.
- Write `docs/performance.md` with hardware, browser, resolution, config, numbers, screenshots, limitations.
- **Accept:** no monotonic growth in Pixi objects/listeners across 5 cycles (document the numbers).

### M16: Docs and delivery

- `README.md`: setup, env vars (even if none), controls, gameplay config, option bounds, scenarios and reset, all commands, how to reproduce each failure.
- `ARCHITECTURE.md`: React/Pixi integration, loop, collisions, resource lifecycle, local persistence, API contracts, cache strategy, pending recovery, limitations, balancing decisions, any deviation from this plan.
- `CREDITS.md` with asset sources/licenses.
- Deploy to Vercel; verify fresh load and reload on the public URL with MSW active.
- **Accept:** clean clone → `pnpm i && pnpm build && pnpm test:e2e` green; deployed URL matches last commit; console clean across all flows.

## 3. Definition of done

- Every item in spec sections 2 through 11 is implemented or explicitly listed as a limitation in `ARCHITECTURE.md`.
- Typecheck, lint, build and e2e green from a clean checkout.
- Public URL live, playable on desktop and mobile landscape.
