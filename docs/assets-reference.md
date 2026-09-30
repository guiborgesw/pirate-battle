# Asset reference (measured)

Numbers below were extracted from the challenge `assets/` directory by decoding the PNGs and
parsing the atlases. They are the source of truth for `src/game/assets/manifest.ts`,
`src/config/tileMap.ts` and the render layer. Re-measure with `scripts/inspect-assets.ts` if the
assets are ever replaced.

## Atlases

| File                                                       | Size      | Notes                                                                                                                                |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `spritesheet/ships_miscellaneous_sheet.png`                | 1024x512  | **Use this one.** XML atlas with 102 sprite rects, no anchors, all sprites point **up**.                                             |
| `spritesheet/ships_miscellaneous_sheet_retina.png`         | 1024x512  | **Not a 2x asset.** Same size, same rects, 88/102 sprites pixel-identical to the 1x sheet. Do not build a retina pipeline for ships. |
| `spritesheet/ui_sheet.png` / `ui_sheet.json`               | 1024x1024 | 36 frames with `anchor`, 9-slice `borders` and `ui.layout` (`content_rect`, `label_rect`, `outer_rect`). Loadable by Pixi as-is.     |
| `spritesheet/ui_sheet_retina.png` / `ui_sheet_retina.json` | 2048x2048 | **Real 2x** (`meta.scale: "2"`, doubled frame rects).                                                                                |
| `tilesheet/tiles_sheet.png`                                | 1024x384  | 16x6 grid of 64px tiles, no margin. **No atlas JSON exists** — generate frames arithmetically (`index = row * 16 + col`).            |
| `tilesheet/tiles_sheet_retina.png`                         | 2048x768  | Real 2x (32x12 grid of 64px).                                                                                                        |

## Tiles (`tiles_sheet.png`, 64px, index = row * 16 + col)

| Category                                        | Indices                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| **Water**                                       | **72** (the only water tile: rgb(69, 204, 230), diagonal wave streaks)   |
| Sand                                            | 0-8, 16-21, 24, 32-37, 40, 51-56, 67, 68                                 |
| Grass                                           | 22, 23, 38, 39 (51, 52 are the greenish shore transitions)               |
| Rocks                                           | 48, 49, 50 (light rock clusters), 64, 65 (rocks with vegetation)         |
| Foliage props                                   | 69, 70, 71, 87                                                           |
| Beach props (planks, barrels, chests)           | 80-85                                                                    |
| Stone fortress (walls, towers, walkways, gates) | 9-15, 26-31, 42-47, 57-63, 73-79, 88-95                                  |
| **Do not use**                                  | 86 (fully transparent); 9-11 / 25-27 / 41-43 are dominated by pure white |

## Ships (`ship_*`, 66x113 each, identical silhouette)

| Group              | Sprites              | Look                                                                               |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| Coloured variants  | `ship_1`..`ship_18`  | 6 emblems (cream, skull, cross, crossed swords, horse/rook, bones-X) x 3 trim sets |
| Weathered / sunken | `ship_19`..`ship_24` | Grey-blue hull and sails; used for the sinking animation                           |

Reference mockup mapping: the player is the dark sail with a **skull** (`ship_2` / `ship_8` /
`ship_14`), enemies are the **blue horse** (`ship_5` / `ship_11` / `ship_17`) and the **red cross**
(`ship_15`); wrecks are `ship_20` / `ship_23`.

There is **no damaged-hull variant of an assembled ship**. Progressive damage lives in the hull
parts: `hull_large_1..4` (50x108) and `hull_small_1..4` (40x108), whose alpha coverage decreases
monotonically (3891 -> 3859 -> 3811) and which read as intact -> chipped -> heavily damaged -> grey
sunken hull.

## Parts and effects

| Sprite                                      | Size                  | Use                                                    |
| ------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `cannon.png`                                | 29x16                 | Deck cannon (front and broadside)                      |
| `cannon_ball.png`                           | 10x10                 | **Projectile** (radius ≈ 5px)                          |
| `cannon_loose.png` / `cannon_mobile.png`    | 20x12 / 29x20         | Deck decoration; mobile carriage                       |
| `wood_1..4`                                 | 15-26x7-10            | Impact debris                                          |
| `fire_1` / `fire_2`                         | 18x39 / 11x27         | Burning hull (damage feedback)                         |
| `explosion_1..3`                            | 74x75 / 60x59 / 42x41 | Three-stage explosion                                  |
| `sail_large_*` (24) / `sail_small_*` (13)   | 66x46-47 / 42x8-9     | Sails; they differ by **colour only**, identical alpha |
| `flag_*` (6)                                | 6x22                  | Mast flags (red, green, blue, yellow, ...)             |
| `pole.png` / `nest.png`                     | 12x11 / 20x18         | Mast pole and crow's nest                              |
| `crew_1..6`                                 | 22x20-22              | Crew props                                             |
| `dinghy_large_*` (3) / `dinghy_small_*` (3) | 20x38 / 16x26         | Scenery boats                                          |

## Island rendering note

The tilesheet has exactly **one** complete rounded sand blob: indices 0, 1, 2 / 16, 17, 18 / 32, 33,
34 (corners measure 80-81 % alpha coverage, the centre 100 %). Every other beige region is plain
sand with straight edges, so composing islands from those produced rectangles. Islands are therefore
drawn as overlapping copies of the verified blob — one per collision circle — plus a 2x2 grass patch
(indices 22, 23 / 38, 39) and a deterministic scatter of rocks (48, 49, 64, 65) and foliage
(69, 70, 71). The visual shape is therefore the same shape ships and projectiles collide with.

## UI and HUD

`png/ui/hud/`: `health_frame`, `health_fill_green|amber|red`, `icon_heart`, `counter_panel`,
`icon_score`, `icon_time`, `enemy_health_frame`, `enemy_health_fill_green|red`.
`png/ui/menu/`: `panel_menu` (384x480, 9-slice 32/40/32/40), `title_pirate_battle` (384x128),
`button_primary_normal|hover|pressed|disabled` (256x88, label rect 32.5x19.5 / 191x46.5),
`button_secondary_normal|pressed`.
`png/ui/controls/`: round buttons and `icon_forward`, `icon_turn_left`, `icon_turn_right`,
`icon_fire_front`, `icon_fire_left`, `icon_fire_right`, `icon_pause`, `icon_play`, `icon_restart`,
`icon_home`, `icon_settings`, `icon_close`, `icon_plus`, `icon_minus`.

`ui_scene_background.png` (918x515) is the menu/options/result backdrop.

## Sounds (27 WAVs, ~5.8 MB)

`cannon_fire_1..3`, `cannon_broadside`, `cannonball_water_hit_1..2`, `ship_wood_hit_1..2`,
`ship_collision`, `ship_explosion_1..2`, `ship_sinking`, `health_low`, `time_warning`,
`score_point`, `game_start`, `game_pause`, `game_resume`, `game_over`, `game_complete`,
`ocean_ambience_loop`, `ship_sailing_loop`, `ui_click`, `ui_hover`, `ui_open`, `ui_close`,
`ui_back`.

## Reference screenshots

`docs/reference/` holds the mockups shipped with the challenge (`sample_menu.png`,
`sample_options.png`, `sample_pause.png`, `sample_ranking.png`, `sample_history.png`,
`sample_result.png`, `sample.png`, `preview.png`). They are the visual target for M9/M13 and are
deliberately **not** published (they stay out of `public/`).
