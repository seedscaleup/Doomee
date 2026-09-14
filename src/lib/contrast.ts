/**
 * WCAG relative luminance and contrast, so the palette can be checked by a
 * test rather than by eye.
 *
 * Contrast is the one visual property that is objectively right or wrong, and
 * the one that regresses silently: a token nudged two shades lighter looks
 * fine to whoever changed it and fails for everyone else.
 */
export type Rgb = { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Not a 6-digit hex colour: ${hex}`)

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function channelLuminance(channel: number): number {
  const normalised = channel / 255
  return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  )
}

/** WCAG contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(parseHex(foreground))
  const second = relativeLuminance(parseHex(background))
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** AA: 4.5 for body text, 3 for large text and for interface components. */
export const AA_NORMAL = 4.5
export const AA_LARGE = 3
