import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/routing'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'

const CATALOGUES = { fr, en } as const

/**
 * Translation OUTSIDE a request: e-mails, PDFs, scheduled jobs.
 *
 * The locale is an explicit argument and never read from a request context
 * (ADR-011). A notification is rendered in the RECIPIENT's language, which is
 * usually not the language of whoever triggered it.
 */
export function translator(locale: Locale) {
  return createTranslator({ locale, messages: CATALOGUES[locale] })
}

/**
 * A message looked up by a key BUILT AT RUNTIME.
 *
 * `translator()` is fully typed, which is what stops a typo reaching a screen —
 * and which is also why it cannot take `status.objective.${row.status}`, a key
 * assembled from a database value. Rather than cast the key and lose the
 * guarantee everywhere, this walks the catalogue as plain data and says
 * honestly when nothing is there.
 *
 * It returns `null` on a miss so the CALLER decides what a missing translation
 * means: a report prints the key's last segment and carries on (R7), a test
 * fails. The catalogue parity test and `pnpm check:i18n` are what keep the
 * misses at zero in the first place.
 */
export function lookupMessage(locale: Locale, key: string): string | null {
  let node: unknown = CATALOGUES[locale]

  for (const segment of key.split('.')) {
    if (!isRecord(node)) return null
    node = node[segment]
  }

  return typeof node === 'string' ? node : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
