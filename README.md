# Pirate Battle

A top-down 2D naval shooter built with **React + TypeScript + PixiJS** for the
[Jungle Gaming game developer challenge](https://github.com/junglegaming/game-developer-challenge).

Sail between islands, fight Chaser and Shooter ships and stack up points before the timer runs out.

> **Status:** M1–M7 are complete: scaffold and toolchain, typed config and storage, asset pipeline, the
> Pixi host on a fixed-step loop, the player sailing an arena with islands and collisions, the three
> gun mounts firing pooled cannonballs, and both enemy types hunting the player with health bars and
> scoring. The match clock and pause arrive with M8; the milestone map is in
> [`docs/plan.md`](docs/plan.md) and every deliberate deviation from it is recorded in
> [`docs/plan-deviations.md`](docs/plan-deviations.md).

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

## Controls

Sail and guns are implemented (M5–M6); touch controls arrive with M13.

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

The two tabs read and write simulated REST endpoints (MSW) through Axios + TanStack Query:
`GET /api/ranking`, `GET /api/players/:playerId/matches`, `PUT /api/matches/:matchId`
(idempotent: re-sending a match never duplicates it). Finished matches are queued in
`localStorage` before the request and retried after refresh. Failure scenarios and the dev panel
that switches between them land in M11/M12.

## Documentation

| File                                                   | Content                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                   | stack, module layout, simulation isolation, lifecycle, persistence, API contracts |
| [`docs/plan.md`](docs/plan.md)                         | the implementation brief (milestones M1–M16)                                      |
| [`docs/plan-deviations.md`](docs/plan-deviations.md)   | validation findings and every deviation, with reasons                             |
| [`docs/assets-reference.md`](docs/assets-reference.md) | measured atlas/tile/ship/sound inventory                                          |
| [`CREDITS.md`](CREDITS.md)                             | asset sources and licences                                                        |
| `docs/reference/`                                      | the mockups shipped with the challenge (visual target, not published)             |
