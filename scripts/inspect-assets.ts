/**
 * Asset inspector — reproduces the measurements recorded in docs/assets-reference.md.
 *
 *   node --experimental-strip-types scripts/inspect-assets.ts tiles
 *   node --experimental-strip-types scripts/inspect-assets.ts atlas
 *   node --experimental-strip-types scripts/inspect-assets.ts compare
 *   node --experimental-strip-types scripts/inspect-assets.ts            (all of the above)
 *
 * It deliberately has no dependencies: PNGs are decoded with node:zlib so the numbers can be
 * re-derived on any machine, in CI or after the assets are replaced.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const ASSETS = join(process.cwd(), 'public', 'assets')

type Rgb = { r: number; g: number; b: number }

type DecodedPng = {
  readonly width: number
  readonly height: number
  readonly alphaAt: (x: number, y: number) => number
  readonly rgbAt: (x: number, y: number) => Rgb
}

type SpriteRect = { name: string; x: number; y: number; w: number; h: number }

function decodePng(path: string): DecodedPng {
  const bytes = readFileSync(path)
  const channels = new Map([
    [0, 1],
    [2, 3],
    [4, 2],
    [6, 4],
  ])

  let offset = 8
  let width = 0
  let height = 0
  let colorType = 6
  const chunks: Buffer[] = []

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data.readUInt8(9)
      if (data.readUInt8(12) !== 0) throw new Error(`interlaced PNGs are not supported: ${path}`)
    }
    if (type === 'IDAT') chunks.push(data)
    if (type === 'IEND') break

    offset += 12 + length
  }

  const channelCount = channels.get(colorType)
  if (channelCount === undefined) throw new Error(`unsupported colour type ${colorType}: ${path}`)

  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channelCount
  const pixels = new Uint8Array(height * stride)

  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw.readUInt8(cursor)
    cursor += 1
    const rowStart = y * stride
    const previousStart = (y - 1) * stride

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channelCount ? pixels[rowStart + i - channelCount] : 0
      const up = y > 0 ? pixels[previousStart + i] : 0
      const upLeft = y > 0 && i >= channelCount ? pixels[previousStart + i - channelCount] : 0

      let value = raw.readUInt8(cursor + i)
      if (filter === 1) value += left ?? 0
      else if (filter === 2) value += up ?? 0
      else if (filter === 3) value += ((left ?? 0) + (up ?? 0)) >> 1
      else if (filter === 4) {
        const pa = Math.abs((up ?? 0) - (upLeft ?? 0))
        const pb = Math.abs((left ?? 0) - (upLeft ?? 0))
        const pc = Math.abs((left ?? 0) + (up ?? 0) - 2 * (upLeft ?? 0))
        value += pa <= pb && pa <= pc ? (left ?? 0) : pb <= pc ? (up ?? 0) : (upLeft ?? 0)
      }
      pixels[rowStart + i] = value & 0xff
    }
    cursor += stride
  }

  const pixelAt = (x: number, y: number): readonly number[] => {
    const index = y * stride + x * channelCount
    return [
      pixels[index] ?? 0,
      pixels[index + 1] ?? 0,
      pixels[index + 2] ?? 0,
      channelCount === 4 ? (pixels[index + 3] ?? 0) : 255,
    ]
  }

  return {
    width,
    height,
    alphaAt: (x, y) => pixelAt(x, y)[3] ?? 0,
    rgbAt: (x, y) => {
      const [r, g, b] = pixelAt(x, y)
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0 }
    },
  }
}

function parseTextureAtlas(path: string): SpriteRect[] {
  const xml = readFileSync(path, 'utf8')
  const rects: SpriteRect[] = []
  const pattern = /<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g

  for (const match of xml.matchAll(pattern)) {
    rects.push({
      name: match[1] ?? '',
      x: Number(match[2]),
      y: Number(match[3]),
      w: Number(match[4]),
      h: Number(match[5]),
    })
  }
  return rects
}

function meanColor(png: DecodedPng, rect: SpriteRect): { mean: Rgb; coverage: number } {
  let count = 0
  let r = 0
  let g = 0
  let b = 0

  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (png.alphaAt(x, y) <= 10) continue
      const pixel = png.rgbAt(x, y)
      r += pixel.r
      g += pixel.g
      b += pixel.b
      count += 1
    }
  }

  const safe = Math.max(count, 1)
  return {
    mean: { r: Math.round(r / safe), g: Math.round(g / safe), b: Math.round(b / safe) },
    coverage: count / (rect.w * rect.h),
  }
}

function alphaCount(png: DecodedPng, rect: SpriteRect): number {
  let count = 0
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (png.alphaAt(x, y) > 10) count += 1
    }
  }
  return count
}

function classify({ r, g, b }: Rgb): string {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (b > r + 12 && b > g + 4) return 'water/stone-blue'
  if (g > r + 8 && g > b + 8) return 'green'
  if (r > 190 && g > 165 && b < 215 && r > b + 15) return 'sand'
  if (max - min < 40) return 'grey'
  return 'other'
}

function inspectTiles(): void {
  const tileSize = 64
  const png = decodePng(join(ASSETS, 'tilesheet', 'tiles_sheet.png'))
  const columns = Math.floor(png.width / tileSize)
  const rows = Math.floor(png.height / tileSize)

  console.log(
    `# tiles_sheet.png ${png.width}x${png.height} → ${columns}x${rows} tiles of ${tileSize}px`,
  )
  console.log('idx  row col  coverage meanRGB            class')

  const byClass = new Map<string, number[]>()

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rect: SpriteRect = {
        name: '',
        x: column * tileSize,
        y: row * tileSize,
        w: tileSize,
        h: tileSize,
      }
      const { mean, coverage } = meanColor(png, rect)
      const index = row * columns + column

      if (coverage < 0.05) {
        console.log(
          String(index).padStart(3),
          String(row).padStart(4),
          String(column).padStart(3),
          `${(coverage * 100).toFixed(0).padStart(7)}%`,
          '-'.padEnd(20),
          'empty',
        )
        continue
      }

      const kind = classify(mean)
      const bucket = byClass.get(kind) ?? []
      bucket.push(index)
      byClass.set(kind, bucket)

      console.log(
        String(index).padStart(3),
        String(row).padStart(4),
        String(column).padStart(3),
        `${(coverage * 100).toFixed(0).padStart(7)}%`,
        `rgb(${mean.r},${mean.g},${mean.b})`.padEnd(20),
        kind,
      )
    }
  }

  console.log('\n# summary by class')
  for (const [kind, indices] of byClass)
    console.log(kind.padEnd(18), indices.length, '→', indices.join(','))
}

function inspectAtlas(): void {
  const rects = parseTextureAtlas(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.xml'))
  const png = decodePng(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.png'))

  console.log(`# ships_miscellaneous_sheet.xml — ${rects.length} sprites`)
  const ships = rects.filter((rect) => rect.name.startsWith('ship_'))
  console.log(`# ship sprites: ${ships.length}`)
  const sizes = new Set(ships.map((rect) => `${rect.w}x${rect.h}`))
  console.log('# ship sprite sizes:', [...sizes].join(', '))
  console.log('# ship alpha coverage (identical silhouettes are expected):')
  for (const ship of ships) {
    console.log('  ', ship.name.padEnd(14), alphaCount(png, ship).toString().padStart(5))
  }
}

function compareSheets(): void {
  const oneX = parseTextureAtlas(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.xml'))
  const retina = parseTextureAtlas(
    join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet_retina.xml'),
  )
  const oneXPng = decodePng(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet.png'))
  const retinaPng = decodePng(join(ASSETS, 'spritesheet', 'ships_miscellaneous_sheet_retina.png'))

  console.log(`# 1x: ${oneXPng.width}x${oneXPng.height} (${oneX.length} sprites)`)
  console.log(`# retina: ${retinaPng.width}x${retinaPng.height} (${retina.length} sprites)`)

  const retinas = new Map(retina.map((rect) => [rect.name, rect]))
  let identical = 0
  let sizeMismatch = 0
  let alphaMismatch = 0
  let missing = 0

  for (const rect of oneX) {
    const other = retinas.get(rect.name)
    if (!other) {
      missing += 1
      continue
    }
    if (other.w !== rect.w || other.h !== rect.h) {
      sizeMismatch += 1
      continue
    }
    if (alphaCount(oneXPng, rect) === alphaCount(retinaPng, other)) identical += 1
    else alphaMismatch += 1
  }

  console.log(`# identical rect + alpha: ${identical}`)
  console.log(
    `# rect mismatches: ${sizeMismatch}, alpha mismatches: ${alphaMismatch}, missing: ${missing}`,
  )
  console.log('# → the ships "retina" sheet is not a 2x asset; convert the 1x sheet only.')
}

const commands: Record<string, () => void> = {
  tiles: inspectTiles,
  atlas: inspectAtlas,
  compare: compareSheets,
}

const requested = process.argv.slice(2)
const toRun = requested.length > 0 ? requested : Object.keys(commands)

for (const name of toRun) {
  const command = commands[name]
  if (!command) {
    console.error(
      `unknown command "${name}" — expected one of: ${Object.keys(commands).join(', ')}`,
    )
    process.exitCode = 1
    continue
  }
  command()
  console.log('')
}
