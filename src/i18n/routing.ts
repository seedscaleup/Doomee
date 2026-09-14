import { defineRouting } from 'next-intl/routing'

/**
 * Interface locales. This is the UI language only.
 * Report language (users.report_locale / reports.locale) is independent — ADR-011.
 */
export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'fr'

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
})

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}
