# Pirate Battle

A top-down 2D naval shooter built with **React + TypeScript + PixiJS** for the
[Jungle Gaming game developer challenge](https://github.com/junglegaming/game-developer-challenge).

Sail between islands, fight Chaser and Shooter ships and stack up points before the timer runs out.

> **Status:** M1–M12 are complete: scaffold and toolchain, typed config and storage, asset pipeline, the
> Pixi host on a fixed-step loop, the player sailing an arena with islands and collisions, three gun
> mounts firing pooled cannonballs, both enemy types hunting the player with health bars and scoring,
> the match clock with pause/end/restart, the menu, options and result screens with persistence, combat
> feedback with sound, the ranking and match history read through a mock REST API, and finished matches
> registered once each — queued locally before the request, retried after a failure, and recovered after
> a reload without ever duplicating. Mobile, accessibility and the end-to-end suite arrive with M13/M14;
> the milestone map is in [`docs/plan.md`](docs/plan.md) and every deliberate deviation from it is
> recorded in [`docs/plan-deviations.md`](docs/plan-deviations.md).

## Requirements

| Tool | Version     | Notes                                                                  |
| ---- | ----------- | ---------------------------------------------------------------------- |
| Node | `>=22.12.0` | pinned in `.nvmrc` (22.22.2) and enforced through `engines.node`       |
| pnpm | 12.8.1      | pinned through `packageManager`; enable it with `corepack enable pnpm` |

```bash
corepack enable pnpm     # once per machine
pnpm install
pnpm dev                 # http://localhost:5173
```

## Commands

| Command                                  | What it does                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                               | Vite dev server                                                                                   |
| `pnpm build`                             | `tsc -b` + production bundle into `dist/`                                                         |
| `pnpm preview`                           | serves the production build (the mock service worker only works in a build)                       |
| `pnpm typecheck`                         | `tsc -b`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`                      |
| `pnpm verify`                            | the milestone gate: typecheck + lint + format check + self-check + production build               |
| `pnpm lint` / `pnpm lint:fix`            | ESLint (typescript-eslint strict, type-aware, simulation isolation rules)                         |
| `pnpm format` / `pnpm format:check`      | Prettier                                                                                          |
| `pnpm test:e2e` / `pnpm test:e2e:update` | Playwright suites and visual baselines (M14)                                                      |
| `pnpm self-check`                        | dependency-free assertions for pure logic: config snapshots, option validation, storage fallbacks |
| `pnpm assets:inspect`                    | re-measures the shipped atlases/tilesheet (see `docs/assets-reference.md`)                        |
| `pnpm assets:convert`                    | regenerates the spritesheet JSON for the ships atlas and the tile sheets                          |

## Environment variables

None. The app is a pure client-side build: gameplay, options and the ranking/history APIs are all
local (the REST endpoints are served by MSW inside the browser). There is no `.env` file to create.

## Gameplay configuration

Every tunable lives in `src/config/gameConfig.ts` and is snapshotted (deep-frozen) at match start;
systems read the snapshot only. Balancing changes never touch system logic.

| Option                               | Range                   | Default |
| ------------------------------------ | ----------------------- | ------- |
| Game session time (`durationSec`)    | 60–180 s, integer       | 120 s   |
| Enemy spawn time (`spawnIntervalMs`) | 1000–10000 ms, step 500 | 3000 ms |

## Trying it locally

```powershell
pnpm install
pnpm verify            # typecheck + lint + format + self-check + production build
pnpm dev               # http://localhost:5173
```

Useful URLs while playing:

| URL                      | What it does                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `http://localhost:5173/` | menu → **Play** → arena (water, letterboxed 1280x720, HUD)                          |
| `?testHooks=1`           | exposes `window.__pb` in the console                                                |
| `?dpr=2`                 | forces the retina spritesheets on a 1x display                                      |
| `?assets=missing`        | simulates a blocked texture: first load fails, **Retry** succeeds without reloading |

In the console with `?testHooks=1`:

```js
__pb.getDiagnostics() // steps, frames, canvas count, listener count, water texture geometry
__pb.useManualClock() // freeze the ticker and drive time yourself
__pb.advance(2000) // runs 120 fixed steps (real systems)
__pb.getState() // status, score, remaining time, HP
__pb.stressEnterExit(10) // 10 mount/unmount cycles; then read __pb.lastStress()
```

`__pb.lastStress()` reports the peak canvas/session/listener counts while a match was mounted and the
counts after leaving — that is the milestone's lifecycle check.

## Screens

| Screen        | What it does                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading       | Progress bar over the asset load; a failed texture offer a Retry without a reload                                                                  |
| Main menu     | Play, Options, the control instructions and the Ranking / Match History tabs                                                                       |
| Options       | Game session time and enemy spawn time: steppers, bounds announced, saved immediately and persisted                                                |
| Match         | The PixiJS arena with the HUD, keyboard controls and pause (manual and automatic)                                                                  |
| Result        | Score, time played, how the match ended, registration status, Play Again and Main Menu                                                             |
| Captain's log | Ranking (filtered by the configuration in force, paginated) and Match History, with loading, empty, error-with-retry and background-refresh states |

The menu, options and result screens are built from the UI atlas (`panel_menu`,
`title_pirate_battle`, `button_primary_*`, `button_secondary_*`, `button_round_*` and the control
icons) over `ui_scene_background.png`, matching the challenge mockups.

## Feedback and audio

Every hit shows something: a muzzle puff and flash where the gun actually is, a splash where a shot
falls into the sea, dust on a rock, an impact flash on a hull, and a staged explosion with lingering
fire when a ship goes down. Hulls also change art at 66% and 33% hull (M7), the timer turns amber and
the alarm sounds in the last ten seconds, and the low-hull alarm fires once per match.

All sound comes from `assets/sounds`: cannon fire (bow and broadside recordings), wood hits, water
hits, explosions, sinking, scoring, collisions, match start and end, and the ocean ambience that runs
under a match with a sailing loop that rises only while the hull is moving. Browsers do not allow audio
before a user gesture, so the engine waits for your first click or key press and drops — silently and
counted — anything asked for earlier. The mute toggle is in Options and is remembered.

## Controls

| Action                      | Keyboard             | Touch (M13)                      |
| --------------------------- | -------------------- | -------------------------------- |
| Move forward                | `W` / `↑`            | forward button (bottom-left)     |
| Turn left / right           | `A` / `←`, `D` / `→` | turn buttons (bottom-left)       |
| Fire front cannon           | `Space`              | fire-front button (bottom-right) |
| Fire left / right broadside | `Q` / `E`            | broadside buttons (bottom-right) |
| Pause                       | `P` / `Esc`          | pause button in the HUD          |

Mobile is supported in **landscape**; portrait shows a "rotate your device" overlay.

## Assets and loading

Every texture and sound is loaded once, with a visible progress bar, before the battle can start:
three spritesheets (ships, tiles, UI) plus 27 sound effects. Textures are mandatory — a blocked
request shows an error naming the failed asset and a Retry button that retries without reloading
the page. Sounds are best-effort: a missing sound is reported and the game falls back to silence.

To reproduce a blocked texture deterministically (used by the E2E suite too), append
`?assets=missing`: the first attempt fails, any retry succeeds.

## Ranking and Match History

The Captain's log reads (and, from M12, writes) simulated REST endpoints through Axios + TanStack Query
against MSW: `GET /api/ranking?configKey&page&pageSize`, `GET /api/players/:playerId/matches?page&pageSize`
and `PUT /api/matches/:matchId` (idempotent: re-sending a match never duplicates it — the same match id
always returns the existing record). The ranking only compares matches played under the same
configuration and breaks ties by score, then duration, then date, then match id.

Both tables handle loading, empty, error-with-retry and background refresh, and they refetch whenever
they are shown again. The mock API runs in every build, including the deployed one, so the states can be
walked through without editing anything: add `?scenario=<name>` to the URL (or press `Shift+D` for the
picker) and pick from `success`, `empty`, `many-pages`, `slow`, `variable-latency`, `out-of-order`,
`timeout`, `network-error`, `http-400`, `http-500`, `ranking-fails`, `history-fails`,
`timeout-after-save` and `offline-at-end`. `?seed=` makes the random ones reproducible, and the panel's
"Reset mock data" restores the fixtures.

Registration happens the moment a match ends: the record is written to `localStorage` **before** the
request goes out, sent as an idempotent `PUT /api/matches/:matchId`, and removed from the queue only when
the server confirms it. The result screen reports the state (`Queued to register`, `Registering…`,
`Registered in the ranking`, or `Not registered yet — will retry` with a retry button), and a queue left
behind by a previous visit is flushed on boot and whenever the browser reports it is back online. Because
the queue is keyed by match id, retrying after a lost answer cannot produce a second record — the case
the `timeout-after-save` and `offline-at-end` scenarios exist to demonstrate.

The acceptance for all of that runs in a real browser:

```
pnpm preview            # serves the built app on :4173
node e2e/m12-registration.mjs   # drives Edge, prints every measurement
```

## Documentation

| File                                                   | Content                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                   | stack, module layout, simulation isolation, lifecycle, persistence, API contracts |
| [`docs/plan.md`](docs/plan.md)                         | the implementation brief (milestones M1–M16)                                      |
| [`docs/plan-deviations.md`](docs/plan-deviations.md)   | validation findings and every deviation, with reasons                             |
| [`docs/assets-reference.md`](docs/assets-reference.md) | measured atlas/tile/ship/sound inventory                                          |
| [`CREDITS.md`](CREDITS.md)                             | asset sources and licences                                                        |
| `docs/reference/`                                      | the mockups shipped with the challenge (visual target, not published)             |
