/**
 * Minimal PNG decoder (8-bit, non-interlaced, colour types 0/2/4/6) plus the two measurements the
 * ship-art assertions need.
 *
 * This lives in the repository rather than in a scratch directory on purpose: the render layer
 * compensates for the direction the asset pack draws its ships in, and that compensation is only
 * defensible while the same measurement runs on every gate. If the atlas is ever regenerated with a
 * different orientation, the self-check fails instead of the ship silently sailing backwards.
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export type FrameRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DecodedPng = {
  readonly width: number
  readonly height: number
  /** Alpha of one pixel, 0-255. Images without an alpha channel are fully opaque. */
  alphaAt(x: number, y: number): number
}

type PngHeader = {
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly colorType: number
  readonly interlaced: number
}

const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }
const ALPHA_OFFSET_BY_CHANNELS: Record<number, number> = { 1: -1, 2: 1, 3: -1, 4: 3 }

function readHeader(buffer: Buffer): PngHeader {
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return {
    width,
    height,
    bitDepth: buffer[24] ?? 8,
    colorType: buffer[25] ?? 6,
    interlaced: buffer[28] ?? 0,
  }
}

export function decodePng(path: string): DecodedPng {
  const buffer = readFileSync(path)
  const header = readHeader(buffer)

  if (header.bitDepth !== 8) throw new Error(`${path}: only 8-bit PNGs are supported`)
  if (header.interlaced !== 0) throw new Error(`${path}: interlaced PNGs are not supported`)

  const channels = CHANNELS_BY_COLOR_TYPE[header.colorType]
  if (channels === undefined)
    throw new Error(`${path}: unsupported colour type ${header.colorType}`)

  const chunks: Buffer[] = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(chunks))
  const stride = header.width * channels
  const pixels = Buffer.alloc(header.height * stride)

  let cursor = 0
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor] ?? 0
    cursor += 1

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? (pixels[y * stride + i - channels] ?? 0) : 0
      const up = y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0
      const upLeft = i >= channels && y > 0 ? (pixels[(y - 1) * stride + i - channels] ?? 0) : 0
      let value = raw[cursor + i] ?? 0

      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const pa = Math.abs(up - upLeft)
        const pb = Math.abs(left - upLeft)
        const pc = Math.abs(left + up - 2 * upLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }

      pixels[y * stride + i] = value & 255
    }
    cursor += stride
  }

  const alphaOffset = ALPHA_OFFSET_BY_CHANNELS[channels] ?? -1

  return {
    width: header.width,
    height: header.height,
    alphaAt(x: number, y: number): number {
      if (alphaOffset < 0) return 255
      return pixels[y * stride + x * channels + alphaOffset] ?? 255
    },
  }
}

/** Opaque pixel count of every pixel row inside a frame. */
export function rowWidths(png: DecodedPng, frame: FrameRect): number[] {
  const rows: number[] = []

  for (let y = 0; y < frame.height; y += 1) {
    let count = 0
    for (let x = 0; x < frame.width; x += 1) {
      if (png.alphaAt(frame.x + x, frame.y + y) > 16) count += 1
    }
    rows.push(count)
  }

  return rows
}

/** Opaque pixel count of every pixel column inside a frame. */
export function columnHeights(png: DecodedPng, frame: FrameRect): number[] {
  const columns: number[] = []

  for (let x = 0; x < frame.width; x += 1) {
    let count = 0
    for (let y = 0; y < frame.height; y += 1) {
      if (png.alphaAt(frame.x + x, frame.y + y) > 16) count += 1
    }
    columns.push(count)
  }

  return columns
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * Raw shape of a spritesheet JSON as the converter writes it (Phaser/Kenney keys: `w`/`h`, not
 * `width`/`height`). `frameRect` converts it, so no cast can hide a mismatch.
 */
export type SheetFrameEntry = {
  readonly frame: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }
}

export type SheetJson = { readonly frames: Record<string, SheetFrameEntry> }

export function frameRect(sheet: SheetJson, name: string): FrameRect {
  const entry = sheet.frames[name]
  if (entry === undefined) throw new Error(`the ships sheet has no "${name}" frame`)

  return {
    x: entry.frame.x,
    y: entry.frame.y,
    width: entry.frame.w,
    height: entry.frame.h,
  }
}
