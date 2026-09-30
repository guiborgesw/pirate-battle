/** Small helpers for pulling textures out of a Pixi spritesheet with a useful error message. */
import type { Spritesheet, Texture } from 'pixi.js'

export function textureOrThrow(sheet: Spritesheet, frame: string): Texture {
  const texture = sheet.textures[frame]
  if (texture === undefined) {
    throw new Error(`frame "${frame}" is missing from the sheet (run pnpm assets:convert)`)
  }
  return texture
}
