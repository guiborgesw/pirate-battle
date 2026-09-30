# Credits

## Code

Written from scratch for the challenge. No third-party game framework beyond PixiJS, no template
code beyond what `create-vite` generates.

## Art and audio

All sprites, tiles, UI components, sound effects and reference mockups come from the challenge
asset pack (`assets/` in <https://github.com/junglegaming/game-developer-challenge>) and are used
as provided; only atlas conversion and file pruning were applied.

| Group                      | Files                                           | Notes                                                                  |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Ships, ship parts, effects | `ships_miscellaneous_sheet.png` (+ XML atlas)   | Kenney-style pixel art pack (CC0 / public domain) — see the note below |
| Terrain                    | `tiles_sheet.png` (16x6 grid of 64px tiles)     | same pack                                                              |
| UI atlas, HUD, controls    | `ui_sheet.png` / `ui_sheet_retina.png` (+ JSON) | "Pirate Battle UI asset pack" v1.0, supplied with the challenge        |
| Scene backdrop             | `ui_scene_background.png`                       | supplied with the challenge                                            |
| Sound effects and loops    | `sounds/*.wav`                                  | supplied with the challenge                                            |
| Reference mockups          | `sample*.png`, `preview.png`                    | supplied with the challenge; kept in `docs/reference/`                 |

The challenge repository ships **no LICENSE file** for its `assets/` directory, so the terms come
from the repository itself. The ship/tile/effect sheets are consistent with Kenney's public-domain
(CC0) asset packs — if this project is ever redistributed outside the challenge, confirm the exact
attribution with Jungle Gaming before publishing.

Not shipped (excluded from `public/assets/` to keep the build small): `vector/` (SVG/SWF sources),
the individual per-tile PNGs, and the reference mockups.

## Tooling

Vite, React, PixiJS, TanStack Query, Axios, MSW, Playwright, ESLint, Prettier, TypeScript, pnpm —
all under their respective open-source licences.
