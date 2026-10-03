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

## Loop and timing (M4)

- `src/game/core/Clock.ts` converts frame deltas into fixed steps. `STEP_MS = 1000/60`,
  `MAX_FRAME_MS = 250`: a single frame can never advance the simulation by more than 250 ms, so a
  backgrounded tab or a debugger pause cannot produce a catch-up burst. The clock reads **no** wall
  clock — the frame delta is injected — which is what makes the simulation testable and why
  `performance.now()`/`Date.now()` are lint errors inside `src/game/core`.
- **Floating-point tolerance.** `1000/60` is not exact in binary: `60 * stepMs` is
  `1000.0000000000001`, so a naive `Math.floor(accumulator / stepMs)` silently drops a step at step
  boundaries (60 frames advanced 999.99 ms instead of 1000 ms — about 0.8 % slow). `Clock.stepsFor()`
  adds a `1e-9 ms` tolerance; `scripts/self-check.ts` guards it with a "60 frames = exactly one
  second" regression test.
- `src/game/core/FixedStepLoop.ts` runs N steps then renders **once** with the interpolation alpha
  (`alpha = leftover / stepMs`). Feeding it 60 small frames and 10 large frames yields the same 60
  steps — frame rate never changes simulation speed (asserted in the self-check, which is the
  restated M5/§0 acceptance from `docs/plan-deviations.md` A8).
- The frame source is injected (`LoopScheduler`): in the app it is Pixi's ticker, in tests it is
  nothing at all and `window.__pb.advance(ms)` drives the loop. `ignoreNextFrame()` drops the first
  delta after a resume so paused wall-clock time is never replayed.
- Pausing is simply "stop calling advance": no steps, no clock movement, frozen cooldowns.

## Renderer and lifecycle (M4)

- `src/game/render/Renderer.ts` initialises Pixi with `resolution = devicePixelRatio` and
  `autoDensity`, then letterboxes the fixed **1280x720 logical arena** inside the host element: one
  `world` container holds the scale and offset, so touch mapping (M13) and future camera work stay
  in logical units. A `ResizeObserver` on the host re-applies the layout on any size change.
- The arena background is a single `TilingSprite` of the only water tile (`tile_r4c8`) instead of a
  16x6 grid of sprites: one draw call, no seams.
- **Retina:** `atlasUrl()` loads `tiles_sheet_retina.json` / `ui_sheet_retina.json` when
  `devicePixelRatio > 1.5`. Pixi applies `meta.scale` (`Spritesheet` parses it), so a 128 px retina
  frame renders at 64 logical pixels; measured, not assumed (see the diagnostics below).
- `destroy()` uses the **two-argument** Pixi 8 signature
  (`app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })`),
  stops the ticker, disconnects the observer and removes every listener. Textures stay in Pixi's
  cache, so re-entering a match does not re-download anything.
- `src/game/GameSession.ts` owns renderer + clock + loop and publishes `HudSnapshot` objects that
  React reads through `useSyncExternalStore`; a snapshot is only emitted when a visible field
  changes, so the HUD never re-renders per frame.

## Test hooks (M4)

Available with `?testHooks=1` (or `MODE === 'test'`) as `window.__pb`:

| Hook                               | Purpose                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()` / `getDiagnostics()`  | status, score, remaining time, HP, sim time, steps, frames, canvas count, HUD listeners, water texture geometry, renderer resolution, world scale |
| `useManualClock()` + `advance(ms)` | runs the real systems in real fixed steps, deterministically                                                                                      |
| `setSeed(n)`                       | seeds the simulation RNG (used from M5)                                                                                                           |
| `stressEnterExit(n)`               | mounts/unmounts the arena `n` times and reports peak and post-exit canvas/session/listener counts                                                 |

Debug URL flags: `?testHooks=1`, `?dpr=2` (force the retina sheets on a 1x display), `?assets=missing`
(blocked texture, retryable), and later `?scenario=`/`?seed=`/`?perf=1` for the mock API and perf work.

## Gameplay: movement, collisions and islands (M5)

- `src/game/sim/World.ts` owns the plain-data world and the ordered system list. `stepWorld()` is the
  only entry point and it never reads a clock or touches the DOM — which is why the whole ruleset can
  be run from `pnpm self-check` and from `window.__pb.advance(ms)`.
- **Heading convention:** `rotation` is radians, `0` points up (screen -Y), positive turns clockwise,
  so a ship sprite drawn facing up uses `sprite.rotation = ship.rotation` directly.
- **Player movement** is intent-driven: turn intents change rotation by `turnSpeedRad * dt`, the
  throttle intent sets `vx`/`vy` from `speed` along the heading, and the position integrates those
  velocities. Measured in the self-check: one second of throttle covers exactly `speed` pixels.
- **Arena bounds** clamp every ship to `[radius, size - radius]` and clear the blocked velocity
  component, so a ship can never leave the visible arena.
- **Islands** are lists of circles. A ship pushed inside one is moved out along the surface normal and
  the inward part of its velocity is removed — the tangential part survives, so ships slide along a
  shore instead of sticking. Both are asserted: dropping a ship on a circle centre pushes it out to
  exactly `islandRadius + shipRadius`, and ramming an island for 120 s of simulated time never
  overlaps it (the restated M5 acceptance from `docs/plan-deviations.md` A8).
- **Config invariant:** every island keeps a ship-sized margin from the arena edge, asserted in the
  self-check, so the bounds clamp can never squeeze a ship back inside an island.
- **Input** (`src/game/input/`) fills an `InputState` that is the mutable mirror of the `ShipIntent`
  contract in `core/intents.ts` — the simulation may not import the input layer, and the compiler
  keeps the two shapes identical. Keyboard listeners attach only while the match runs, `preventDefault`
  is limited to game keys, and losing focus clears the state so a ship never sails on by itself.
- **Rendering** interpolates between the previous and current fixed step
  (`prev + (current - prev) * alpha`), which is why entities carry `prevX`/`prevY`/`prevRotation`.
- **Ships are composed from parts** (`hull_N` + `pole` + `sail` + `flag` + `cannon`) rather than using
  the pre-assembled `ship_*` sprites, so the damage ladder (`hull_large_1..4`) and the per-kind sail
  colours are available; `src/config/shipAppearance.ts` maps health ratio to the ladder
  (intact → chipped ≤ 66 % → badly damaged ≤ 33 % → grey wreck).

## Weapons and projectiles (M6)

- Three mounts with **independent cooldowns**: the bow fires one shot along the heading, each
  broadside fires `count` parallel shots **perpendicular** to the heading, spaced `spread` apart
  _along the hull_ and mirrored between port and starboard. Holding every fire key never couples the
  mounts — each may only fire when its own cooldown has run out (asserted: every gap between shots is
  at least `cooldownMs`).
- Shots appear at `muzzleOffsetPx` from the ship centre, which matches the `cannon` sprite offset, so
  a ball leaves the barrel instead of the deck centre. That tunable was added to `WeaponStats` (see
  `docs/plan-deviations.md`).
- A shot's life ends three ways: its **lifetime** (`lifeMs`), **leaving the arena**, or **touching an
  island circle**. Islands are terrain, not targets — the shot dies on contact and does not bounce.
  Damage application arrives with the health system in M7, which is where the brief's own milestone
  split puts it.
- Effective reach is `projectileSpeed x lifeMs`, asserted to stay within 5 % of the configured
  `rangePx` so the two numbers cannot drift apart unnoticed.
- **Removal**: a dying entity only sets `alive = false`; one `compact()` at the end of the step
  removes dead entities in place and pushes an `entityRemoved` event per removal. The renderer
  releases pooled sprites from those events — never by diffing the world — so a frame that runs
  several fixed steps still frees every sprite exactly once. Asserted: removals reported == shots
  fired − shots alive.

* **Projectile rendering** uses a single sprite pool (`render/pools.ts`). Sprites are created on
  demand, stay children of their layer and only toggle `visible`, so a busy fight never adds or
  removes children mid-frame; the diagnostics report `created` / `active` / `pooled`.
* **Ship art orientation**: the pack draws ships bow-down, so every ship view adds a half turn
  (`ART_FACING_OFFSET_RAD`) — and the side-on bow gun a quarter turn — to make the hull point where
  the simulation says it is going. Both constants are asserted against the atlas pixels in
  `pnpm self-check`, because this failure mode (sailing stern-first) is invisible to typecheck, lint
  and the headless checks: it only shows up on screen. Details in `docs/assets-reference.md`.

## Enemies, spawning and scoring (M7)

- **Chaser**: seeks the player and rams. Contact costs the player `contactDamage`, destroys the Chaser
  and sets `killedBy = 'self'`, which never moves the score.
- **Shooter**: closes in until `preferredRange`, then holds that ring, turning to face the player; it
  fires when the player is inside `attackRange`, its own cooldown has run out and its bow is on target
  (`aimToleranceRad`). It will not fire into a reef.
- **Steering has no pathfinding** (plan §1.3): both kinds turn toward the player at their
  `turnSpeedRad` and thrust only along their own heading, exactly like the player. A probe of
  2 × radius ahead of the bow is what keeps them off the islands — if it lands inside one, the enemy
  swerves one step to the side with more clearance, re-evaluated every step. Asserted: over a full
  two-minute match no enemy ever overlaps land, leaves the arena or produces a NaN coordinate.
- **Spawn schedule**: every `spawn.intervalMs`, up to `spawn.candidates` points are drawn inside the
  arena's edge band; the first point clear of islands _for that kind's hull_ and at least
  `minDistanceFromPlayer` from the player wins. If no candidate passes, the tick is skipped rather
  than forced — spawning on top of the player would be unfair damage, which the spec forbids.
  Weighted by `spawn.weights`, with one guarantee: the first two spawns are one of each kind, so both
  types always appear in a standard match. `spawn.maxAlive` caps the arena.
- **Damage and death**: a projectile applies its damage once and dies on impact, so a killing shot
  cannot also hit a second hull in the same step. A destroyed enemy leaves the arrays at the step's
  `compact()`, which is what makes "a killed enemy stops firing, damaging and colliding" true rather
  than aspirational. `world.score` only moves when `killedBy === 'player'`.
- **Health bars** above every ship, built from the UI atlas parts (`health_frame` +
  `health_fill_green|amber|red`) and coloured by the same thresholds as the hull damage ladder, so a
  bar and the wood under it never disagree. One bar per ship, reused all match: the texture swaps only
  when the tier changes, the width only when the ratio does, and the bars live in an unrotated layer
  so they stay level while the hull rolls.

## Match clock, pause and end (M8)

- **The simulation owns the clock.** `world.remainingMs` counts down inside `matchSystem`, which runs
  last in the step — so the step in which the buzzer sounds still resolves completely (a cannonball
  already in the air can still land) and the freeze starts on the next step. The HUD reads the
  simulation, never wall time, so a paused or finished match cannot drift on screen.
- **The match ends two ways**: the clock reaching zero (`'time'`) or the player's hull reaching zero
  (`'death'`). The first reason written wins; nothing can rewrite how a match ended.
- **The freeze is one guard**, `if (world.ended) return` at the top of `stepWorld`, rather than a
  check sprinkled through every system. That is what makes "the end stops movement, attacks, damage,
  spawns and scoring" (spec §2) true by construction. Asserted with every input held down for five
  simulated seconds against a finished match: the clock does not advance, the ship does not move or
  turn, the guns produce nothing, the schedule stays off and the score cannot move.

* **Pause** (§1.6) triggers on `P`/`Escape`, the HUD button, `window.blur` and a hidden tab. While
  paused the loop does not step, so the clock and every cooldown are frozen, and the gameplay key
  listeners are detached — a paused match cannot be driven by keys that are still held down. Resume is
  an explicit action in the dialog: it clears `InputState`, clears the loop's partial accumulator and
  drops the next frame delta, so the paused wall-clock time is never replayed. The acceptance check is
  a 20 s pause measured in real time against `world.remainingMs`.
* **Keyboard contract**: a keystroke another handler already consumed must not be treated as gameplay
  input. `resume()` re-attaches the gameplay keys, so without this the Escape that resumed the match
  kept bubbling to the freshly attached listener and paused it again — the dialog could not be left
  with the keyboard at all. The dialog consumes Escape (`preventDefault` + `stopPropagation`) and
  `KeyboardInput` ignores `defaultPrevented` events; both halves are asserted in `pnpm self-check`
  against an injected listener target.

- **The HUD is an external store.** `GameSession` holds the snapshot and notifies subscribers;
  `GameScreen` reads it with `useSyncExternalStore`, and `publish()` emits a new snapshot object only
  when a visible field actually changes. The claim "the HUD does not re-render every frame" is
  measured, not asserted: `renderCounter.ts` counts real HUD renders and `window.__pb.getHudRenders()`
  exposes the count (measured on a production build, since React Strict Mode double-invokes render in
  development).
- **Restart is a real remount**: `GameScreen` bumps a run id, the effect cleanup calls `destroy()` and
  a session is built from scratch, so hull, score, clock and every entity are restored instead of
  reset field by field. The compact result panel here is a placeholder — M9 replaces it with the
  styled result screen and the registration status.

## Screens, options and the last result (M9)

- **One router, two rules.** `App.tsx` owns `loading → menu → (options | arena) → result`. A match in
  progress is never written to storage, so reloading the page or leaving the arena returns to the menu
  with nothing recorded; a finished match is persisted exactly once, in the same breath as the match
  ending. `GameScreen` calls `onMatchEnd` behind a `finishedRef` guard, because `destroy()` also ends a
  session internally — without that guard, abandoning a match would look exactly like finishing one.
- **Screens are built from the UI atlas**, not from hand-made chrome: the `panel_menu` frame, the
  `title_pirate_battle` banner, `button_primary_*` / `button_secondary_*` / `button_round_*` with the
  control icons, over `ui_scene_background.png`. All sizes come from measured sprites. The panel keeps
  the sprite's 384:480 ratio so its corner plates stay round — the mockups stretch the frame into a
  landscape panel, and the spec leaves menu identity to the author, so that ratio is the one
  deliberate difference.
- **Options** expose the two parameters the spec names — game session time and enemy spawn time — as
  steppers, matching `sample_options.png`. Stepping can only produce values inside the documented
  bounds, hitting a bound is announced through an `aria-live` status rather than silently ignored, and
  every change is persisted immediately. The one way invalid data can reach the screen is a corrupt or
  hand-edited store, and that case is reported with `role="alert"` instead of being swallowed.
- **The result screen** shows the score, the time actually played (so a match cut short by death
  reports its real length, not the session length), how it ended, the registration status and both
  actions. Registration is honestly `pending` until the API layer lands: the field exists so M11/M12
  fill it in rather than invent it later.
- **Storage is injectable**, which is what turns "survives a reload" into a headless assertion instead
  of a browser ritual. The self-check writes options and a result through a fake backend and reads them
  back, and proves that a corrupt store, an out-of-range stored value, a result played longer than its
  session, an unknown ending and an unparseable timestamp are all refused rather than displayed as
  fact. The browser run confirms the same round trip against real `localStorage`.

## Feedback and audio (M10)

- **The simulation reports; the render draws; the audio plays.** Every effect is driven by an event,
  and the events carry enough payload that neither layer ever re-derives simulation geometry: a shot
  reports the mount and the exact muzzle point, a projectile removal reports where it died and why
  (`expired`, `edge`, `terrain`, `hit`), damage reports where it landed and whether it killed, and an
  enemy removal reports `killedBy`. `render/effects/feedback.ts` turns each event into effect and sound
  requests — pure, so the whole mapping is asserted in `pnpm self-check` with no Pixi and no device.
- **No effect is drawn twice.** A shot that hit a hull reports both a damage event and a removal with
  reason `hit`; the damage event draws the impact and the removal deliberately draws nothing. The same
  rule keeps a destroyed ship from exploding twice, once for the lethal damage and once for the
  removal.
- **The composed effects.** The pack ships explosion and fire sprites but has no smoke and no splash,
  so the muzzle puff and the water splash are `Graphics` primitives (a puff that expands and fades, a
  fan of droplets with a ring on the water) and everything else is a sprite. Measuring the art decided
  one detail: `fire_1`/`fire_2` taper from 2 px at the top to 18 px at the base, so the flame's tip is
  up and needs **no** rotation offset — unlike the hull sprites, which are drawn bow-down and carry
  `ART_FACING_OFFSET_RAD`.
- **Effects advance on `simTimeMs`**, not on wall time: the loop already reports it, the manual test
  clock drives it, and a tab that was hidden for a minute cannot make every pooled effect jump to the
  end of its life in one frame (the delta is clamped like the loop's own frame budget). Effects are
  pooled by kind and `getEffects(kind)` counts them, which is how "every hit produces visible feedback"
  became a measurement instead of a claim.

* **Audio starts only from a gesture.** No `AudioContext` exists before the first pointer or key press;
  requests that arrive earlier are counted as `droppedWhileLocked` and dropped silently, which is
  exactly the acceptance ("no audio errors when the tab lacks user gesture"). Buffers come from the
  loader already fetched as raw `ArrayBuffer`s and the match factory **awaits the decode** before the
  session exists — without that await the first `game_start` and both loops vanished in silence
  (`plays: {}` with zero drops, which is why the "buffer not ready" path now has its own counter). The
  same sound fired twice inside 45 ms is one event — a broadside is a volley, and three stacked cannon
  blasts is noise.

- **One-shot warnings are pure functions.** `resolveAlerts` owns "once per match" for the low-hull
  alarm (with hysteresis, so a future repair re-arms it) and the ten-second warning. It never fires
  while paused or finished. The HUD highlight uses the same `TIME_WARNING_SEC` constant, so the sound
  and the amber timer can never disagree about when the end is close.
- **Mute is a device setting, not a session parameter.** It lives in its own store (`pb.audio.v1`)
  rather than in the gameplay options, is applied to the master gain the moment the engine is built,
  and is toggled from Options with `aria-pressed`.

## Remote data and the Captain's log (M11)

- **Contracts first, with a runtime check.** `api/contracts.ts` holds the wire types, both orderings
  (ranking: score desc → shorter match → earlier → id; history: newest first), the page maths and the
  parsers. The parsers are not ceremony: a table that renders `undefined` because a field was renamed is
  worse than one that says it could not read the answer, so a page with a single broken item is refused
  whole.
- **One axios instance, one place to look.** Base `/api`, 5 s timeout, and the TanStack `signal`
  forwarded so a superseded page request is actually aborted (with `exactOptionalPropertyTypes` in the
  way, the key is only added when there is one). `describeError` prefers the API's own message and
  deliberately re-throws cancellations untouched — dressing up "a newer page arrived" as an error would
  be a bug, not a nicety. A request interceptor counts calls per endpoint, which is how "the tabs
  refetch when they are shown again" became measurable.
- **Query options are the contract**: `keepPreviousData` so paging never flashes empty, `staleTime`
  10 s, `retry: 2`, `refetchOnWindowFocus`, and `refetchOnMount: 'always'` — inside the stale window a
  plain remount would not refetch, and the acceptance says it must.
- **One collection, two views.** The mock database keeps a single list of match records; the ranking is
  a filtered sorted view of it and the history a filtered view by player. That is what makes "exactly one
  history record and one ranking entry, consistent between the tabs" true by construction: an idempotent
  upsert by match id cannot produce a second entry anywhere. It is persisted in `pb.mockdb.v1`, so
  confirmed records survive a refresh.
- **Scenarios are data, not conditionals sprinkled through the handlers.** `mocks/scenarios.ts` resolves
  `?scenario=`, remembers it in `sessionStorage`, seeds the latency RNG from `?seed=` and owns the
  per-endpoint latency table; the handlers only translate that into a delay, a failure or an answer.
  `out-of-order` answers the first request last on purpose, `timeout` outlives the client's own timeout
  (asserted against `REQUEST_TIMEOUT_MS`), and `timeout-after-save` stores the record _before_ it goes
  quiet — which is what M12 has to recover from. Two bugs the browser run caught here: seeding ran on
  every request (the board grew to 46 pages) and the panel's reset only dropped the in-memory copy, so
  the runaway board came straight back from storage. Both are now asserted headlessly.
- **The mocks run in every build**, service worker resolved against `BASE_URL`,
  `onUnhandledRequest: 'bypass'`, started before the first render and failing soft, so a browser without
  service workers still gets the game. The scenario panel on `Shift+D` ships with it because a reviewer
  opening the deployed URL needs to walk the failure cases without editing anything.
- **The board follows the mockups**: one Captain's log screen with two tabs, the wide wooden frame (the
  menu keeps the sprite's ratio; a table needs the width and the mockups draw it that way), the player's
  own row and the newest match highlighted, and `Page X of Y` between two round buttons.

## Registering a finished match (M12)

- **The order is the design.** A finished match is written to `pb.pending.v1` _before_ the request goes
  out, the request is a `PUT` keyed by match id, and only a confirmed answer removes it. So a lost answer
  costs a retry and never a record, and a retry cannot duplicate because the server keys on that id. An
  abandoned match writes nothing at all — the write happens in the same breath as the match ending.
- **The queue is the only source of truth for a match's status.** `removePending` is called from the
  flush and nowhere else, which makes "still queued" and "not registered yet" the same question. The
  result screen reads that answer (`saving` while a flush is in flight, then `saved` or `failed`) instead
  of tracking a status beside the queue — a second source of truth is how a screen ends up insisting
  "Registering…" about a match the server stored a minute ago.
- **A flush is a queue, not a race.** One at a time (guarded by a ref), sequential, oldest first, and a
  failure does not stop the records behind it. Flushing runs on boot — which is what makes a match queued
  in a previous visit register after a reload — and on the browser's `online` event.
- **Only a confirmed save invalidates the tabs.** On success the ranking and history roots are
  invalidated and the stored result is marked registered, so the menu's "last match" line stops claiming
  a match is unregistered and the player's own row appears in the log with the `You` badge.
- **The registration call is not a react-query mutation.** The mutation object's identity changes on
  every render, which re-armed the effect that flushes and re-sent the same match in a loop; an explicit
  async routine is stable and says what it does. Recorded in `docs/plan-deviations.md` §I.

## Touch, portrait and accessibility (M13)

- **One input state, three devices.** The touch overlay writes into the same `InputState` the keyboard
  writes into, so the simulation never learns which one is playing — the plan's §1.7 promise, kept by
  construction rather than by care. The writing is exposed as a named adapter (`createTouchWriter`)
  because mutating shared state from an event handler is deliberate here and React's compiler rules are
  right to object to raw mutation in a component.
- **A stick, not five buttons.** The left thumb gets a stick that carries thrust and turn together (up is
  ahead, sideways is a turn, diagonal is W+A); the right thumb gets the three guns. Multi-touch is what
  makes steering and firing possible at the same time, so the stick remembers the pointer that owns it
  and each gun handles its own. `?touch=1` forces the controls on, which is how the desktop run verifies
  them: the stick moved the ship −153 px and a gun button took the shot count from 0 to 3.
- **The clock stops when the arena cannot be seen.** Portrait phones get a rotate notice and an automatic
  pause (`pauseReason: 'orientation'`), so the match never runs down behind the message. Rotating back
  leaves it paused on purpose: resuming is the player's decision, not a side effect of moving a phone.
- **Responsive by height, because the art is.** The wooden panel is sized by `min(44rem, 94dvh)` with the
  sprite's own ratio, so a 640x360 landscape squeezes it; media queries shrink the paddings, the fonts,
  the HUD band and the log table rather than rescaling the art. Measured at 640x360: the HUD occupies
  `[6, 6, 627, 40]` — inside the viewport, nothing clipped.
- **The HUD speaks, and only when it should.** The announcement is a pure function of the snapshot whose
  text is _constant inside each thirty-second stretch_ (and once more at ten seconds), so a polite live
  region fires when a bucket is crossed, when the score changes, or when the match pauses — and has
  nothing to say in between. "Avoid announcing every frame" is therefore structural: there is no timer,
  no effect and no state to keep in step.
- **Contrast is measured, not eyeballed.** `contrastRatio` implements the WCAG formula and the gate
  asserts every foreground/background pair the UI actually uses, from gold-on-wood titles to the table
  rows. The axe scan (`e2e/m13-axe.mjs`, `@axe-core/playwright`) then checks the rendered screens for
  real: **zero violations** on menu, options, result, both log tabs and the paused arena.

## The end-to-end suite (M14)

- **Against the built app, in two projects.** `webServer` runs `pnpm build && pnpm preview`, so the tests
  exercise the artefact that gets deployed; `desktop-chromium` is 1280x720 and `mobile-chromium` is a
  Pixel 7 in landscape, and the visual baselines are per project because the two frames are different
  pictures.
- **Real rules, controlled time.** Every spec opens `?testHooks=1&seed=1&scenario=<name>` and hands the
  clock to the test with `useManualClock()`, then runs the simulation for real via `advance(ms)`. Combat
  tests press the game's own keys (`hold('Space', 120)`) and check what happened to the world; nothing is
  poked into the simulation from outside except spawns, which is what `spawnEnemy` is for.
- **A fixture so the specs read like the behaviour.** `e2e/fixtures.ts` wraps the hooks in an `App`
  (`play`, `hold`, `advance`, `finishByTime`, `finishByDeath`, `steerTowards`, `state`, `shots`,
  `apiCalls`) and types `window.__pb`, so no spec needs `any` or a hand-written evaluate.
- **`steerTowards` is a control loop, not arithmetic.** It reads the ship, decides `a` or `d` for a
  hundred milliseconds, then sails, until it arrives or stops moving. A test that computed the turn from
  the rotation rate would break the day the ship is retuned for being correct.
- **One worker.** The specs drive a real simulation against a shared preview server; a suite that passes
  twice in a row is worth more here than one that finishes early. The acceptance is exactly that: green
  twice, and a deliberately broken collision rule failing a test (done, and recorded in
  `docs/plan-deviations.md` §K).
- **Visual regression on what the challenge names** — the menu, the arena after two seeded seconds, and
  the result — with the match clock masked, because that is the one value on screen that legitimately
  depends on how fast the browser got there.

## Pending sections

The performance evidence (`?perf=1`, a 180-second match, five start/play/exit cycles) and the deploy are
filled in with M15/M16.
