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

## Pending sections

Loop and interpolation, collisions, React/Pixi boundary, resource lifecycle, persistence keys, API
contracts, cache strategy and pending-registration recovery are filled in as M4-M12 land.
