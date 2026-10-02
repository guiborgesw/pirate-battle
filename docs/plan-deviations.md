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
