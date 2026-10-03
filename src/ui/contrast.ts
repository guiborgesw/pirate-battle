/**
 * WCAG contrast, computed rather than eyeballed (plan M13 asks for AA contrast; the palette is gold on
 * dark wood, which is exactly the kind of pairing that looks fine and measures badly).
 *
 * Ratios are asserted in `scripts/self-check.ts` against the real colours, including the ones sampled
 * from the button sprites, so a palette change that breaks AA fails the gate instead of the review.
 */

export type Rgb = {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** `#rrggbb` (or `#rgb`) to components. Anything else is rejected, so a typo cannot pass silently. */
export function parseHexColour(hex: string): Rgb | undefined {
  const value = hex.trim().replace('#', '')
  if (value.length === 3) {
    const [r, g, b] = value.split('')
    if (r === undefined || g === undefined || b === undefined) return undefined
    return parseHexColour(`${r}${r}${g}${g}${b}${b}`)
  }
  if (value.length !== 6 || !/^[0-9a-f]{6}$/i.test(value)) return undefined

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

/** sRGB relative luminance, exactly as WCAG defines it. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export const AA_NORMAL_TEXT = 4.5
export const AA_LARGE_TEXT = 3

/** The WCAG contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number | undefined {
  const front = parseHexColour(foreground)
  const back = parseHexColour(background)
  if (front === undefined || back === undefined) return undefined

  const first = relativeLuminance(front)
  const second = relativeLuminance(back)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)

  return (lighter + 0.05) / (darker + 0.05)
}
