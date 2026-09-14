import type { Locale } from '@/i18n/routing'

/**
 * Every date, number and amount the product shows goes through here.
 *
 * Three rules this file exists to enforce (CLAUDE.md §8):
 *  - formatting is done by Intl, never by hand;
 *  - the locale decides the FORMAT, the data decides the CURRENCY (ADR-024);
 *  - dates are rendered in the reader's own time zone, because "overdue"
 *    must not be off by a day for someone in Abidjan (risk R9).
 *
 * Pure functions with explicit arguments: no request context, no ambient
 * locale, so they work identically in a page, an e-mail and a PDF (ADR-011).
 */
export type FormatPreferences = {
  locale: Locale
  timezone: string
  dateFormat: string
}

const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' }

function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale]
}

/** A calendar date, as the reader's own day. */
export function formatDate(value: Date, preferences: FormatPreferences): string {
  return new Intl.DateTimeFormat(intlLocale(preferences.locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: preferences.timezone,
  }).format(value)
}

export function formatDateLong(value: Date, preferences: FormatPreferences): string {
  return new Intl.DateTimeFormat(intlLocale(preferences.locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: preferences.timezone,
  }).format(value)
}

export function formatDateTime(value: Date, preferences: FormatPreferences): string {
  return new Intl.DateTimeFormat(intlLocale(preferences.locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: preferences.timezone,
  }).format(value)
}

/**
 * Money is always a pair (ADR-024). There is no formatAmount(number) on
 * purpose: an amount without its currency is a bug waiting to be printed.
 */
export function formatMoney(
  amount: number,
  currency: string,
  preferences: FormatPreferences,
): string {
  return new Intl.NumberFormat(intlLocale(preferences.locale), {
    style: 'currency',
    currency,
    // XOF has no minor unit; Intl already knows, so let it decide.
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

export function formatNumber(value: number, preferences: FormatPreferences): string {
  return new Intl.NumberFormat(intlLocale(preferences.locale)).format(value)
}

/** A ratio in 0..1 rendered as a percentage. */
export function formatPercent(
  ratio: number,
  preferences: FormatPreferences,
  fractionDigits = 0,
): string {
  return new Intl.NumberFormat(intlLocale(preferences.locale), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio)
}

/**
 * "in 3 days" / "2 days ago". Used everywhere a deadline is shown, so it is
 * worth being exact about the boundary: the comparison is between CALENDAR
 * days in the reader's zone, not between instants. Otherwise "due today" turns
 * into "due yesterday" for anyone whose day has not started in UTC yet.
 */
export function formatRelativeDays(value: Date, now: Date, preferences: FormatPreferences): string {
  const days = calendarDaysBetween(now, value, preferences.timezone)

  return new Intl.RelativeTimeFormat(intlLocale(preferences.locale), {
    numeric: 'auto',
  }).format(days, 'day')
}

/** Whole calendar days from `from` to `to`, in the given zone. */
export function calendarDaysBetween(from: Date, to: Date, timezone: string): number {
  const start = startOfDayUtc(from, timezone)
  const end = startOfDayUtc(to, timezone)
  return Math.round((end - start) / 86_400_000)
}

/**
 * The midnight that starts `value`'s day in `timezone`, as a UTC timestamp.
 * Built from Intl parts rather than arithmetic so it stays correct across DST
 * changes and half-hour offsets.
 */
function startOfDayUtc(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(value)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  return Date.UTC(get('year'), get('month') - 1, get('day'))
}

/** True when the date is strictly before today in the reader's zone. */
export function isOverdue(due: Date, now: Date, timezone: string): boolean {
  return calendarDaysBetween(now, due, timezone) < 0
}
