# Architecture

Pirate Battle — a top-down naval shooter for the _game developer challenge_
(<https://github.com/junglegaming/game-developer-challenge>). The challenge spec is the source of
truth; `docs/plan.md` is the implementation brief and `docs/plan-deviations.md` lists every place
where this build deviates from it and why.

## Stack (as built)

| Concern                 | Choice                                                                          | Installed                |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| Build tool              | Vite                                                                            | 8.3.1 (rolldown bundler) |
| Language                | TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 6.0.3                    |
| UI                      | React + `useSyncExternalStore` (no global state library)                        | 18.3.1                   |
| Rendering               | PixiJS                                                                          | 8.21.0                   |
| Remote state            | TanStack Query                                                                  | 5.104.0                  |
| HTTP                    | Axios                                                                           | 1.20.0                   |
| Network mocking         | MSW                                                                             | 2.15.0                   |
| E2E + visual regression | Playwright (+ `@axe-core/playwright`)                                           | 1.63.0 / 4.13.0          |
| Lint / format           | ESLint (flat, `typescript-eslint` strict + type-aware) + Prettier               | 10.11.0 / 3.9.9          |
| Package manager         | pnpm (pinned with `packageManager` so Corepack uses the same version)           | 12.8.1                   |
| Styling                 | CSS Modules                                                                     | —                        |

Node is pinned with `.nvmrc` (22.22.2) and `engines.node: >=22.12.0` (Vite 8 requirement).

## Deviations from the brief and from the plan

| #   | Decision                                                                                              | Reason                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | React **18** kept (the template scaffolds 19)                                                         | The brief locks React 18; no 19-only API is needed. Cheap to flip later.                                                                                                      |
| D2  | `msw` pinned to **2.x** (latest is 3.x)                                                               | The brief locks msw v2; keeps the documented `http`/`HttpResponse` surface.                                                                                                   |
| D3  | Ships atlas: only the 1x sheet is converted                                                           | The shipped "retina" ships sheet is 1024x512 with identical rects — see `docs/assets-reference.md`.                                                                           |
| D4  | No "damaged ship" sprite swap                                                                         | Assembled ships have a single silhouette; progressive damage uses the `hull_large_1..4` / `hull_small_1..4` part ladder, `fire_1`/`fire_2` and the grey `ship_19..24` wrecks. |
| D5  | `public/assets/` holds the needed subset (~13 MB), not the raw 30 MB tree                             | `vector/`, `*.swf`, individual tile PNGs and the reference mockups are not shipped. The mockups live in `docs/reference/` instead.                                            |
| D6  | ESLint also restricts globals and `Date.now`/`Math.random`/`performance.now` in `src/game/{sim,core}` | `no-restricted-imports` alone cannot enforce §0 of the brief.                                                                                                                 |
| D7  | The simulation-isolation rules may not be "grepped" for numeric literals                              | Arena size, fixed step and clamp live in config; the M2 acceptance check is restated in `docs/plan-deviations.md`.                                                            |
| D8  | ESLint replaces the template's `oxlint`                                                               | The brief requires `typescript-eslint` strict + type-aware rules.                                                                                                             |

## Layout

```
src/
  config/     gameplay config + option schema (M2)
  game/
    core/     fixed-step loop, clock, rng, event bus, math (M2/M4)
    sim/      world, entities, systems (M5-M8)
    render/   Pixi renderer, views, pools (M4-M7)
    input/    keyboard and touch input state (M5/M13)
    assets/   manifest + loader (M3)
    GameSession.ts  the only object React talks to (M4)
  ui/         screens, components, hud, session store (M8/M9)
  api/        contracts, axios client, query hooks, pending registrations (M11/M12)
  mocks/      MSW worker, handlers, db, fixtures, scenarios (M11/M12)
  storage/    versioned localStorage helpers (M2)
e2e/          Playwright suites and fixtures (M14)
scripts/      asset conversion and inspection tools (M3)
public/assets assets copied from the challenge repository
docs/         brief, deviations, asset reference, reference mockups, performance notes
```

## Simulation isolation (brief §0)

`src/game/sim/**` and `src/game/core/**` must not import `pixi.js`, `react`, `react-dom`, the
render/input/UI/network/persistence layers, and must not touch `window`, `document`, `navigator`,
`localStorage`, `sessionStorage`, the wall clock (`Date.now`, `new Date`, `performance.now`) or an
unseeded `Math.random`. All of that is enforced as lint **errors** in `eslint.config.js`, so
`pnpm lint` fails on a violation instead of relying on review.

## Configuration (M2)

`src/config/gameConfig.ts` owns **every** gameplay number: arena size, match duration, spawn
weights/limits/edge band, island geometry (circles), and the `maxHp`/`speed`/`turnSpeedRad`/`radius`
plus weapon stats (`damage`, `cooldownMs`, `projectileSpeed`, `rangePx`, `lifeMs`,
`projectileRadius`, broadside `spread`/`count`) of the player, the Chaser and the Shooter.

- `createMatchConfig(options)` returns a **deep-frozen** snapshot. Systems receive that snapshot and
  never read the module-level default, so changing options mid-session only affects the next match.
- `configKey(config)` → `d<duration>-s<interval>` groups ranking entries per configuration;
  `configLabel(config)` renders the human line shown above the ranking (see the mockups).
- `src/config/optionsSchema.ts` holds the option bounds (60-180 s integer, 1000-10000 ms step 500),
  defaults, `parseOptions` (validation with per-field messages), `clampOptionValue`,
  `stepOptionValue` and `formatOptionValue` (milliseconds display as seconds, as in the mockups).
- The simulation cannot smuggle tuning values in: `@typescript-eslint/no-magic-numbers` is an
  error inside `src/game/sim/**` (see `docs/plan-deviations.md` A7).

## Persistence (M2)

`src/storage/localStore.ts` wraps `localStorage` with versioned keys, a schema-checked read and a
try/catch on every access. `readJson` distinguishes `missing`, `corrupt` and `unavailable`, so a
hand-edited value or a private-mode browser degrades to defaults instead of throwing.

| Key                | Content                                       | Written by          |
| ------------------ | --------------------------------------------- | ------------------- |
| `pb.options.v1`    | last saved `GameOptions`                      | Options screen (M9) |
| `pb.lastResult.v1` | last finished `MatchRecord`                   | Result screen (M9)  |
| `pb.playerId.v1`   | local player uuid                             | M11                 |
| `pb.pending.v1`    | `matchId → MatchRecord` awaiting registration | M12                 |
| `pb.mockdb.v1`     | MSW in-memory database                        | M11                 |

When `localStorage` is missing or throws, an in-memory backend keeps the app working for the
session. `configureStorage(backend)` is the seam used by `scripts/self-check.ts`.

## Assets (M3)

- `scripts/convert-kenney-xml.ts` (`pnpm assets:convert`) turns `ships_miscellaneous_sheet.xml`
  into Pixi spritesheet JSON and derives the tile frames (`tile_r<row>c<col>`) from the grid,
  including a real 2x retina variant. The generated JSON is committed.
- `src/game/assets/manifest.ts` is the only place that knows asset URLs: three atlases
  (ships/tiles/ui) and 27 sounds. High-DPR screens get the retina sheets where they really are 2x
  (tiles, UI) — never the ships sheet.
- `src/game/assets/loadAssets.ts` loads every asset **once** and caches the promise. Textures come
  through Pixi's `Assets`; sounds are fetched as `ArrayBuffer`s and decoded lazily by the audio
  layer (M10). A failed attempt is never cached, so Retry performs a real second request.
- Texture failure is fatal and rejects with `AssetLoadError`, whose `failures` array lists the
  failed keys — the loading screen renders that list next to a Retry button. A failed **sound** is
  best-effort: it is reported as a warning and the game still runs (silently).
- `?assets=missing` (`src/game/assets/debugFlags.ts`) reproduces "a texture request is blocked":
  the first attempt fails and any retry succeeds, which is exactly the DevTools scenario the
  milestone asks for and the deterministic hook the Playwright suite will use (spec §8 item 2).
- `src/config/tileMap.ts` names the tiles used by the game (water is `tile_r4c8`) and the island
  blobs; every id was measured, not guessed (`pnpm assets:inspect tiles`).

## Conventions

- Relative imports carry explicit extensions (`./App.tsx`, `../../config/gameConfig.ts`). The
  template already enables `allowImportingTsExtensions`, and it keeps every module runnable under
  plain Node — which is what `scripts/` rely on.
- `scripts/self-check.ts` (`pnpm self-check`) asserts pure logic (config freezing, option
  validation, storage fallbacks) without a test framework; `scripts/inspect-assets.ts`
  (`pnpm assets:inspect`) re-derives the asset measurements in `docs/assets-reference.md`.

## Pending sections

Loop and interpolation, collisions, the React/Pixi boundary, resource lifecycle, API contracts,
cache strategy and pending-registration recovery are filled in as M4-M12 land.
