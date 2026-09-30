/**
 * Converts the challenge atlases into PixiJS spritesheet JSON and commits the output.
 *
 *   pnpm assets:convert
 *
 * * `ships_miscellaneous_sheet.xml` (Starling/TextureAtlas) → `ships_miscellaneous_sheet.json`.
 *   The shipped "_retina" ship sheet is *not* a 2x asset (identical size, identical rects), so it
 *   is deliberately not converted — see docs/assets-reference.md.
 * * `tiles_sheet.png` has no metadata beyond "each tile is 64x64, no margin", so the frames are
 *   derived from the grid. Frames are named `tile_r<row>c<col>` (self-documenting) and the retina
 *   sheet uses the same names with doubled rects and `meta.scale: "2"`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS = join(process.cwd(), 'public', 'assets')
const TILE_SIZE = 64
const TILE_COLUMNS = 16
const TILE_ROWS = 6

type Frame = {
  frame: { x: number; y: number; w: number; h: number }
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
}

type Sheet = {
  frames: Record<string, Frame>
  meta: {
    app: string
    image: string
    format: 'RGBA8888'
    size: { w: number; h: number }
    scale: string
  }
}

function pngSize(path: string): { w: number; h: number } {
  const bytes = readFileSync(path)
  const isPng = bytes.readUInt32BE(0) === 0x89504e47
  if (!isPng) throw new Error(`not a PNG: ${path}`)
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) }
}

function makeFrame(x: number, y: number, w: number, h: number): Frame {
  return {
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
  }
}

function writeSheet(target: string, sheet: Sheet, label: string): void {
  writeFileSync(join(ASSETS, target), `${JSON.stringify(sheet, null, 2)}\n`)
  console.log(`  ${label} → ${target} (${Object.keys(sheet.frames).length} frames)`)
}

function convertShips(): void {
  console.log('ships atlas')
  const xml = readFileSync(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.xml'), 'utf8')
  const image = join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.png')
  const pattern = /<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g

  const frames: Record<string, Frame> = {}
  for (const match of xml.matchAll(pattern)) {
    const [, name = '', x = '0', y = '0', w = '0', h = '0'] = match
    // Frame names drop the ".png" suffix so sprites can be looked up as `ship_5`, `cannon_ball`, ...
    frames[name.replace(/\.png$/, '')] = makeFrame(Number(x), Number(y), Number(w), Number(h))
  }

  if (Object.keys(frames).length === 0) {
    throw new Error('no SubTexture entries found — the XML format changed?')
  }

  writeSheet(
    'spritesheet/ships_miscellaneous_sheet.json',
    {
      frames,
      meta: {
        app: 'Pirate Battle (converted from ships_miscellaneous_sheet.xml)',
        image: 'ships_miscellaneous_sheet.png',
        format: 'RGBA8888',
        size: pngSize(image),
        scale: '1',
      },
    },
    'ships_miscellaneous_sheet.xml',
  )
}

function convertTiles(): void {
  console.log('tilesheet')

  const buildSheet = (image: string, scale: number): Sheet => {
    const size = pngSize(join(ASSETS, 'tilesheet', image))
    const frames: Record<string, Frame> = {}

    for (let row = 0; row < TILE_ROWS; row += 1) {
      for (let column = 0; column < TILE_COLUMNS; column += 1) {
        frames[`tile_r${row}c${column}`] = makeFrame(
          column * TILE_SIZE * scale,
          row * TILE_SIZE * scale,
          TILE_SIZE * scale,
          TILE_SIZE * scale,
        )
      }
    }

    return {
      frames,
      meta: {
        app: 'Pirate Battle (grid derived from tilesheets.txt: 64x64 tiles, no margin)',
        image,
        format: 'RGBA8888',
        size,
        scale: String(scale),
      },
    }
  }

  writeSheet('tilesheet/tiles_sheet.json', buildSheet('tiles_sheet.png', 1), 'tiles_sheet.png')
  writeSheet(
    'tilesheet/tiles_sheet_retina.json',
    buildSheet('tiles_sheet_retina.png', 2),
    'tiles_sheet_retina.png (2x)',
  )
}

convertShips()
convertTiles()
console.log('\nAtlas conversion complete.')
