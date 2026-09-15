import { Font } from '@react-pdf/renderer'

/**
 * ============================================================================
 * THE PDF'S TYPEFACE.
 *
 * `Helvetica` is one of the fourteen faces every PDF reader is REQUIRED to
 * provide, so the file carries no font programme and still renders identically
 * on a phone, in a browser viewer and in print. It covers WinAnsi, which covers
 * French: é è à ç ù œ « » all print correctly.
 *
 * What this deliberately avoids is `Font.register({ src: 'https://…' })`, the
 * usual way to embed a face with @react-pdf/renderer. That makes a network
 * fetch part of rendering a document — inside a job, on a deadline, against a
 * host nobody owns. A CDN hiccup would stop a client's report from being
 * produced, and rule 13 exists precisely so that no such dependency is added
 * without noticing.
 *
 * The product has no brand typeface yet (the interface uses the system stack).
 * When one is chosen, it is registered HERE from a file shipped in the image —
 * bytes in the repository, never a URL — and nothing else changes.
 * ============================================================================
 */
export const PDF_FONT = 'Helvetica'
export const PDF_FONT_BOLD = 'Helvetica-Bold'

/**
 * Long French and English words break better with hyphenation off than with
 * the default dictionary-less guesswork, which splits "objectifs" as "obje-
 * ctifs".
 */
export function configurePdfFonts(): void {
  Font.registerHyphenationCallback((word) => [word])
}
