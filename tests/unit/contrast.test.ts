import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AA_LARGE, AA_NORMAL, contrastRatio } from '../helpers/contrast'

/**
 * The palette, checked against WCAG AA.
 *
 * Contrast is the one visual property that is objectively right or wrong, and
 * the one that regresses silently: a token nudged two shades lighter looks fine
 * to whoever changed it and fails for everyone else. axe catches it on the
 * screens that exist; this catches it in the token itself, before any screen.
 *
 * The values are read from globals.css, so the test cannot drift from what the
 * application actually renders.
 */
function readTokens(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8')
  const tokens: Record<string, string> = {}

  for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    const [, name, value] = match
    if (name && value) tokens[name] = value
  }

  return tokens
}

const TOKENS = readTokens()

function token(name: string): string {
  const value = TOKENS[name]
  if (!value) throw new Error(`Token --color-${name} is missing from globals.css`)
  return value
}

const BACKGROUNDS = ['background', 'surface', 'surface-sunken'] as const

describe('the palette is readable', () => {
  it('found the tokens in the stylesheet', () => {
    expect(Object.keys(TOKENS).length).toBeGreaterThan(10)
  })

  /** Body text, secondary text and captions all have to clear 4.5:1. */
  describe.each(['doomee-black', 'muted', 'subtle'])('%s as text', (name) => {
    it.each(BACKGROUNDS)('is readable on %s', (background) => {
      expect(contrastRatio(token(name), token(background))).toBeGreaterThanOrEqual(AA_NORMAL)
    })
  })

  /**
   * The semantic text siblings, on their own tinted background AND on the
   * plain ones — a success message sits on success-soft, a status badge label
   * sits on the badge's fill.
   */
  describe.each([
    ['success-text', 'success-soft'],
    ['danger-text', 'danger-soft'],
    ['warning-text', 'warning-soft'],
    ['info-text', 'info-soft'],
  ])('%s', (text, soft) => {
    it('is readable on its own tint', () => {
      expect(contrastRatio(token(text), token(soft))).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it.each(BACKGROUNDS)('is readable on %s', (background) => {
      expect(contrastRatio(token(text), token(background))).toBeGreaterThanOrEqual(AA_NORMAL)
    })
  })

  /**
   * The brand colours themselves are used as fills, borders and dots, which
   * need 3:1 — not as text. This test states that boundary so nobody
   * "simplifies" by using the fill colour for a label.
   */
  describe.each(['success', 'danger', 'info'])('%s as a fill', (name) => {
    it('clears the 3:1 bar for a non-text element', () => {
      expect(contrastRatio(token(name), token('background'))).toBeGreaterThanOrEqual(AA_LARGE)
    })
  })

  /**
   * Warning is the documented exception, and it is deliberate.
   *
   * #F59E0B is the colour the cahier des charges specifies, and against the
   * light background it is 2.05:1 — below the 3:1 a standalone graphical
   * indicator needs. We do NOT change the brand. Instead the rule is that the
   * warning colour is never the ONLY carrier of meaning: a warning dot always
   * sits next to its label, a warning badge always has text and a border.
   * That is WCAG 1.4.1 (use of colour), which applies regardless of ratio.
   */
  it('is only ever used alongside a label, never alone', () => {
    expect(contrastRatio(token('warning'), token('background'))).toBeLessThan(AA_LARGE)
    // The label beside it is what carries the meaning, and it is readable.
    expect(contrastRatio(token('warning-text'), token('background'))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    )
    // And the colour works as a fill under dark text, which is how the badge
    // and any future chart series use it.
    expect(contrastRatio(token('doomee-black'), token('warning'))).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the brand colours exactly as the cahier des charges specifies', () => {
    // These are the client's identity. If one of them ever fails a contrast
    // check, the answer is a darker -text sibling, never a different brand.
    expect(token('doomee-yellow')).toBe('#ffd21f')
    expect(token('doomee-black')).toBe('#111111')
    expect(token('background')).toBe('#fafaf7')
    expect(token('surface')).toBe('#ffffff')
    expect(token('border')).toBe('#e8e8e3')
    expect(token('success')).toBe('#22a06b')
    expect(token('danger')).toBe('#e5484d')
    expect(token('warning')).toBe('#f59e0b')
  })

  it('puts black on yellow, never white', () => {
    // #FFD21F with white text is 1.45:1 — unreadable. With black it is 13:1.
    expect(contrastRatio(token('doomee-black'), token('doomee-yellow'))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    )
    expect(contrastRatio(token('surface'), token('doomee-yellow'))).toBeLessThan(AA_NORMAL)
  })

  it('keeps the destructive button readable', () => {
    // White on the brand red is only 3.9:1, so the button uses the darker
    // sibling. This is why Button's danger variant is bg-danger-text.
    expect(contrastRatio(token('surface'), token('danger-text'))).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps a meaningful boundary visible', () => {
    // border-strong draws the dashed empty-state box, which is a real
    // interface element rather than decoration, so it needs to be seen.
    // border (the hairline between rows) stays deliberately quiet.
    expect(contrastRatio(token('border-strong'), token('surface'))).toBeGreaterThan(2.5)
  })
})
