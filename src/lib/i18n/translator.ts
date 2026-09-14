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
