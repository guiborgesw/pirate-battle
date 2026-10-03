# Plan validation and deviations

This file records the audit of `docs/plan.md` against the challenge spec and against the assets
that actually ship, plus every decision this repository takes where the brief is wrong, incomplete
or silent.

**Sources checked**

| Source               | Version                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| Challenge spec       | `junglegaming/game-developer-challenge`, `README.md`, commit `3158914` (2026-09-09) |
| Implementation brief | `docs/plan.md` (also delivered as `plano-agent.html`; both contain the same text)   |
| Assets               | the 520 files of the challenge `assets/` tree, measured with `pnpm assets:inspect`  |

Acceptance criteria that were restated (M2, M5, M10) are marked in the milestone list below so the
"green build" gate stays honest.

## A. Errors found in the brief

| #   | Brief says                                                                                                            | Evidence                                                                                                                                                                                                                                               | Resolution here                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | M4/§1.5 — destroy Pixi with `{ children: true }`                                                                      | PixiJS 8 `Application.destroy(rendererDestroyOptions, options)`; the official example is `app.destroy({ removeView: true }, { children: true, ... })`                                                                                                  | Always call it with **two** arguments: `app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })`. A single object argument is parsed as renderer options and leaks every child.                                                                                       |
| A2  | M10 — "damaged hull sprite swaps at 66 % and 33 % hp"                                                                 | All 24 `ship_*` sprites share one silhouette (bbox 63x110) and have no damaged variant. Damage states exist only as hull **parts**: `hull_large_1..4` / `hull_small_1..4` (alpha 3891 → 3859 → 3811; intact → chipped → heavily damaged → grey sunken) | Ships are rendered from parts (`hull_N` + `pole` + `sail` + `flag` + `cannon`), so the 66 %/33 % swap becomes real; `fire_1`/`fire_2` overlay a burning hull and the grey `ship_19..24` are used for the wreck.                                                                                           |
| A3  | M3 — convert `ships_miscellaneous_sheet(.retina).xml`                                                                 | Both XMLs declare identical rects; both PNGs are 1024x512; 88 of 102 sprites are identical in rect **and** alpha                                                                                                                                       | Convert the 1x sheet only. `ui_sheet_retina.json` (2048², `meta.scale: "2"`) and `tiles_sheet_retina.png` (2048x768) _are_ real 2x and are used for high-DPR rendering.                                                                                                                                   |
| A4  | §1.3 — "render once with interpolation alpha"                                                                         | The entity shape in §1.3 has no previous-state fields, so interpolation cannot be implemented as specified                                                                                                                                             | Entities carry `prevX`/`prevY`/`prevRotation`, captured at the start of each fixed step.                                                                                                                                                                                                                  |
| A5  | §1.1 — screens `menu \| options \| game \| result`                                                                    | `sample_ranking.png` / `sample_history.png` show a dedicated "Captain's Log" screen with two tabs, required by M9/M11                                                                                                                                  | Screen union is `menu \| options \| log \| game \| result`.                                                                                                                                                                                                                                               |
| A6  | §0 — forbid `Date.now()`, `Math.random()`, `performance.now()` in the simulation, enforced by `no-restricted-imports` | Import rules cannot see globals or property access                                                                                                                                                                                                     | `eslint.config.js` adds `no-restricted-globals` (`window`, `document`, `navigator`, `localStorage`, `sessionStorage`), `no-restricted-properties` (`Date.now`, `Math.random`, `performance.now`) and `no-restricted-syntax` (`new Date`) for `src/game/{sim,core}`.                                       |
| A7  | M2 — "grep shows no numeric gameplay literals in `src/game/sim`"                                                      | Contradicts §1.3, which hard-codes the 1280x720 arena, the fixed step and the 250 ms clamp                                                                                                                                                             | Arena size, step, clamp and every tuning value live in `src/config`. **Restated acceptance:** `@typescript-eslint/no-magic-numbers` is an **error** for `src/game/sim/**` (allowing `0`, `1`, `2`, array indexes and enums), so `pnpm lint` fails on a stray tuning literal instead of relying on a grep. |
| A8  | M5 — "speed identical with throttled CPU (6x) vs normal"                                                              | Not observable as written: the 250 ms clamp changes wall-clock progress under CPU throttling                                                                                                                                                           | **Restated acceptance:** no single frame may advance sim time by more than 250 ms; distance per fixed step is identical regardless of frame rate (verified through `?testHooks=1` + `advance()` and the `?perf=1` frame log).                                                                             |

## B. Gaps in the brief (spec requires, brief does not cover)

| #   | Gap                                                                                                                                              | Resolution                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | The spec asks for a **delivery estimate before starting**; the brief has no deliverable for it                                                   | Estimate sent separately: ~2 weeks calendar, ≈45 h of effective work, block breakdown in the review note                                                                                                                |
| B2  | `playerName` has no source, yet `MatchRecord` requires it and the ranking shows player identity                                                  | Persisted default `"Captain Jack"` (the name used by the shipped mockups); ranking rows belonging to the local `playerId` get the **YOU** badge. An editable name field is _not_ added — `sample_options.png` has none. |
| B3  | `GameConfig` misses values the spec lists explicitly                                                                                             | Add `arena { width, height }`, `weapon.lifeMs` (projectile lifetime), `spawn.edgeBandPx`, `spawn.candidates` (was hard-coded 30) and the island layout, so balance changes never touch system logic                     |
| B4  | The result screen needs `matchId`, `playedAt` and `durationMs`, which `HudSnapshot` does not carry                                               | `GameSession` builds the `MatchRecord` (uuid generated at match start, outside the simulation) and hands it to React through an `onEnd(result)` callback                                                                |
| B5  | Audio has no strategy, and no audio library is allowed by §1.1                                                                                   | Web Audio API with decoded buffers, unlocked on first user gesture; no new dependency                                                                                                                                   |
| B6  | No font ships with the assets (zero `.ttf`/`.woff`), and the brief never mentions fonts                                                          | One self-hosted OFL font (credited in `CREDITS.md`); E2E screenshots wait for `document.fonts.ready` so the visual baselines are stable                                                                                 |
| B7  | Options: the brief wants a form with inline errors; `sample_options.png` shows steppers with immediate persistence and only a `MAIN MENU` button | Steppers as the primary control (clamped to 60–180 s and 1000–10000 ms), auto-persisted, plus an accessible status message; the validation requirement is met by clamping + documented limits. **Open for review.**     |
| B8  | Ranking page size and config filter presentation are unspecified                                                                                 | 5 rows per page (matches the mockup) and a human-readable filter line ("120 SECOND BATTLES · 3 SECOND SPAWN INTERVAL") instead of the raw `d120-s3000` key                                                              |
| B9  | Spec §11 requires a lockfile; the brief never mentions it                                                                                        | `pnpm-lock.yaml` is committed, plus `packageManager`, `.nvmrc` and `engines.node`                                                                                                                                       |
| B10 | Playwright visual baselines get a platform suffix (`-win32.png`), so a Linux CI would fail                                                       | `snapshotPathTemplate` without the platform suffix and a README note on regenerating baselines                                                                                                                          |
| B11 | Service workers and `crypto.randomUUID()` need a secure context, so MSW dies when the game is opened on a phone over a LAN IP                    | Documented: use a tunnel/HTTPS or port forwarding for device testing; `uuid` has a non-crypto fallback                                                                                                                  |
| B12 | The brief maps only part of the shipped sounds to events                                                                                         | All 27 provided sounds are mapped (collisions, wood hits, water hits, score, low health, time warning, UI clicks, ambience/sailing loops, game start/pause/resume/over/complete)                                        |

## C. Decisions taken

Recorded in `ARCHITECTURE.md` → "Deviations": React 18, msw 2.x, ships 1x atlas only, part-composed
ships, pruned `public/assets/` (~13 MB of the 30 MB tree, with mockups moved to `docs/reference/`),
ESLint instead of the template's oxlint, and the extra simulation-isolation lint rules. Two further
decisions taken while implementing M3: **sound loading is best-effort** (a failed sound warns and
the game keeps running instead of blocking the loading screen, as the brief implies for every key),
and `?assets=missing` exists as a deterministic stand-in for "texture blocked in DevTools".

One addition while implementing M6: `WeaponStats` gained **`muzzleOffsetPx`**. The brief's weapon
stats had no muzzle offset, so shots would have appeared at the ship's centre while the `cannon`
sprite sits 26 px forward — the ball would visibly leave the deck instead of the barrel. It is a
tunable, so under the brief's own rule ("every tunable number lives here") it belongs in the config
snapshot rather than in render code.

Two while implementing M7:

- `GameConfig` gained an **`enemyAi`** block (`probeRadii`, `swerveRad`, `aimToleranceRad`). The plan
  fixed the probe length at 2 × radius but left the swerve step and the aiming cone unspecified; both
  are balance numbers, so they join the config snapshot by the same rule as `muzzleOffsetPx`.
- **Health bars are drawn with the provided UI sprites, not with Pixi `Graphics`** as the plan's M7
  line said. `ui_sheet` ships `health_frame` plus `health_fill_green|amber|red`, and the challenge
  mockups draw exactly those bars above their ships — so using them matches the visual reference
  instead of reinventing it. The colour thresholds reuse the hull damage ladder (`≤ 33 %`, `≤ 66 %`),
  so the bar and the wood can never disagree.

## D. Open questions for the author

| #   | Question                                                                 | Default if unanswered      |
| --- | ------------------------------------------------------------------------ | -------------------------- |
| D1  | Keep React 18 or move to 19?                                             | React 18 (brief)           |
| D2  | Options as steppers (mockup) or as validated inputs (brief)?             | Steppers + clamped limits  |
| D3  | Confirm the ~2 week estimate with the challenge provider before starting | Estimate sent as B1        |
| D4  | Vercel deployment credentials for M16                                    | M16 blocked until provided |

## E. Additions while implementing M8

- `HudSnapshot` gained **`pauseReason`** (`'user' | 'blur' | 'hidden' | 'auto'`). The plan's snapshot
  shape stopped at `endReason`, but the pause dialog has to say _why_ the match stopped — "you paused
  it" and "the tab went to the background" call for different reactions from the player. It joins the
  same contract: a new snapshot object only when a visible field changes.
- The **result panel is a placeholder** in `Hud.tsx`. M9 owns the styled result screen (score, time
  played, end reason, registration status, Play Again, Main Menu), so M8 only implements what its
  acceptance needs: the match stops, the score is readable, and "Play again" is a real
  `destroy()` + new session.

## F. Additions while implementing M9

- **The wooden panel keeps the sprite's ratio.** `panel_menu.png` is 384x480 (portrait) while the
  challenge mockups stretch the frame into a landscape panel. Stretching it 1.6x sideways would make
  its round corner plates oval, and the spec leaves the menu's visual identity to the author ("a seu
  critério … coerente com os assets"), so the frame stays at its own ratio and only the content inside
  is laid out like the mockups.
- **Ranking and Match History are placeholders.** They exist as buttons with a "Soon" badge, as in
  `sample_menu.png`, and pressing one announces through `aria-live` that the data arrives with the API
  milestone. The alternative — a screen that pretends to load and then shows nothing — would read as a
  bug in the delivery.
- **The menu carries a "Last match: …" line**, which the mockup does not show. The spec requires the
  last result to be persisted; making it visible is how that promise is verifiable to the player
  rather than only true inside `localStorage`.
- **The M8 result panel was deleted, not kept.** The placeholder in `Hud.tsx` is gone: with a real
  result screen, leaving the old panel would mean two places claiming to show the same match.

## G. Additions while implementing M10

- **Muzzle smoke and water splashes are composed.** The pack has explosion and fire sprites but no
  smoke and no splash, so both are drawn with `Graphics` primitives (a puff that expands and fades, a
  fan of droplets with a ring) and everything else uses the sprites. This composition was put to the
  author before implementation and approved; the alternative was a shot with no smoke at all.
- **`SimEvent` grew three payloads.** The plan's events reported removals by id only, which is enough
  to release a pooled sprite but not to place an effect: the feedback layer would have had to look up
  or re-derive positions after the entity was already gone. Events now carry the muzzle point and mount
  for a shot, the position and reason for a projectile that died, and the position, amount, lethality
  and source of damage. The "no effect drawn twice" rule (a removal with reason `hit` shows nothing,
  because the damage event already drew it) is asserted in the self-check.
- **Mute is stored apart from the gameplay options** (`pb.audio.v1` rather than `pb.options.v1`). The
  spec's Options screen is about the two session parameters; mute is a device setting, and keeping it
  separate means it applies to the menus too, not just to a match.
- **The HUD timer turns amber and pulses in the last ten seconds.** The plan asks for the warning
  sound; the highlight uses the same constant so the two cannot drift apart.

## H. Additions while implementing M11

- **The Captain's log is one screen with two tabs**, as `sample_ranking.png` and `sample_history.png`
  draw it, rather than two separate screens. Switching tabs remounts the table, which is also what
  satisfies "the tabs refetch when they are shown again".
- **This screen stretches the wooden frame.** The menu keeps `panel_menu`'s own 384x480 ratio (see F);
  a table needs the width and the mockups draw a wide board, so here the sprite is stretched and the
  corner plates are the price. It is a deliberate exception, not an oversight.
- **The ranking's configuration comes from the stored options at mount**, not from the match config of
  the last game: opening the log after changing the session length shows the board for the configuration
  the next match would use, which is what the filter is for.
- **The scenario panel ships in every build** (plan §1.10 asks for a way to select scenarios; the mocks
  themselves must work in the published build). It is not drawn over the arena, where it would fight the
  HUD for the same corner.
- **The API client counts requests per endpoint** and exposes the counts through the test hooks. Without
  it, "the tabs refetch when they are shown again" would be an assumption about React Query rather than a
  measurement — the browser run shows the ranking counter going 2 → 3 on a tab switch.

## K. Additions while implementing M14

- **The suite uses the browser already installed on the machine.** Playwright normally wants its own
  Chromium build (~600 MB to download). `channel: 'msedge'` runs the system's Edge — a Chromium — with
  no download at all, so `pnpm i && pnpm test:e2e` works on a machine that cannot fetch a browser. The
  project names stay `desktop-chromium` / `mobile-chromium` because that is what they are.
- **One worker, deliberately.** The specs drive a real simulation against one preview server and each
  spec is already a full journey; the acceptance is "green twice in a row", so determinism is worth more
  than wall-clock time here.
- **A thirteenth spec file for the visual regression.** The plan maps files 1:1 to the twelve flows and
  asks for visual baselines separately; `13-visuals.spec.ts` keeps the mapping clean instead of hiding
  screenshots inside an unrelated flow.
- **Baselines are per project.** A 1280x720 desktop frame and a Pixel 7 landscape frame are different
  pictures, so `snapshotPathTemplate` files them under `e2e/__screenshots__/<project>/`. They were
  recorded on Windows with Edge: on another platform run `pnpm test:e2e:update` once and commit the
  result — the suite says so itself when the images differ.
- **The M12/M13 measurement scripts stay.** `e2e/m12-registration.mjs`, `m13-axe.mjs` and `m13-mobile.mjs`
  print what they measured rather than asserting, which is what made the earlier acceptance arguments
  checkable; the Playwright specs are the ones that fail a build.
- **`steerTowards` steers in a loop instead of computing a turn.** It reads the ship, presses `a` or `d`
  for a hundred milliseconds, then sails, until it arrives or stops moving. A test that derived the turn
  from the rotation rate would break the day the ship is retuned — and being retuned is not a bug.

## J. Additions while implementing M13

- **The touch controls are a stick plus three guns, not five buttons.** Plan §1.7 says "on-screen buttons";
  a stick carries thrust and turn in one thumb (up ahead, sideways a turn, diagonal W+A) and the guns sit
  under the right one. Multi-touch is the requirement that shaped it: steering and firing at once needs
  two fingers, so the stick remembers its pointer and each gun handles its own.
- **`?touch=1` forces the controls on.** A reviewer on a desktop needs to see and drive them; without it
  the only way to check the touch path would be a real phone. The desktop run uses it to measure the
  stick and the guns.
- **The announcement is a pure function of the snapshot, not a timer.** "Time every 30 s and at 10 s"
  becomes a bucketed string that is constant inside each stretch, so a polite live region speaks when a
  bucket is crossed and stays quiet in between. No `setState` in an effect, no interval to leak — and
  "avoid announcing every frame" holds by construction.
- **Rotating back to landscape leaves the match paused.** The pause is automatic when the arena becomes
  invisible; resuming is a button press. Making a rotation resume would be the device deciding when the
  player is ready.
- **Portrait is only "portrait" on a small screen.** A desktop window that happens to be taller than it
  is wide is not a phone and gets no rotate notice, so the rule is orientation _and_ width.
- **The touch writer is a named adapter.** Mutating the shared `InputState` from an event handler is the
  design, but React's compiler rules are right to object to a component mutating what looks like a prop,
  so the mutation lives behind `createTouchWriter` where it reads as what it is.

## I. Additions while implementing M12

- **The registration flow is an explicit async routine, not a `useMutation`.** Plan §1.9 describes
  `useRegisterMatch = useMutation`. A mutation object gets a new identity on every render, so a callback
  depending on it re-arms any effect that uses it: the first version re-sent the same match on every
  render, forever, and the mock log filled with PUTs the same second. The flush is now a stable
  `useCallback` doing one `flushPending` at a time, guarded by a ref.
- **The result screen's status is derived from the queue, not tracked beside it.** "Still queued" and
  "not registered yet" are the same question, and the queue is only emptied by the server's own
  confirmation. The first version kept a parallel per-match map of statuses and sat on "Registering…"
  while the queue was already empty and the record was already stored — the storage said `saved` and the
  screen said otherwise, which is exactly the kind of disagreement a second source of truth produces.
- **`LastMatchResult` gained `matchId`** so a confirmed registration marks exactly the result it belongs
  to. A result stored by an earlier build (no id) is refused by the parser and shows as "no finished
  match yet" rather than with a status that belongs to someone else's match.
- **`e2e/m12-registration.mjs` drives the acceptance in a real browser** (the system's Edge, so no
  Chromium download): the plan's acceptance is about a queue surviving a browser reload, not about a
  function returning. Run `pnpm preview` and then `node e2e/m12-registration.mjs`; it prints every
  measurement it makes. M14's Playwright suite grows out of it.
- **While a flush is in flight, any match still in the queue reads as "saving".** For a match from an
  earlier session that is the honest reading of one shared queue, and it lasts seconds.
