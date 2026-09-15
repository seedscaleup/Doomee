/**
 * Calendar arithmetic in a given timezone. Pure, no dependencies, no clock.
 *
 * This lives in `lib` rather than in a module because "what day is it in Abidjan
 * right now" is not project knowledge — and because two modules need it. A
 * second implementation would be a second set of edge cases at the daylight
 * saving boundary, which is exactly the bug this code exists to prevent (R9).
 */

/**
 * The calendar date in a timezone — 'YYYY-MM-DD'.
 *
 * "Late" is a question about a calendar DAY. A deadline of the 15th is not
 * missed at 23:00 on the 14th in Abidjan just because it is already the 15th in
 * Paris. Intl does the conversion; doing it by hand with offsets is how daylight
 * saving quietly breaks a report twice a year.
 */
export function calendarDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

/** A due date is late once the relevant day has moved past it. */
export function isOverdue(
  dueDate: string | null | undefined,
  timezone: string,
  now: Date,
): boolean {
  if (!dueDate) return false
  return dueDate < calendarDate(now, timezone)
}

/** Days remaining, counted in the given timezone. Negative once late. */
export function daysUntil(
  dueDate: string | null | undefined,
  timezone: string,
  now: Date,
): number | null {
  if (!dueDate) return null

  const today = Date.parse(`${calendarDate(now, timezone)}T00:00:00Z`)
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  if (Number.isNaN(due)) return null

  return Math.round((due - today) / 86_400_000)
}

/** Adds days to a 'YYYY-MM-DD' string without leaving the calendar. */
export function addDays(day: string, days: number): string {
  const parsed = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed)) return day
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10)
}
