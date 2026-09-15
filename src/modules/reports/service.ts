/**
 * ============================================================================
 * The rules of a report, as pure functions.
 *
 * No database, no request context — so "which sections does a monthly client
 * report have?" and "may this report still be edited?" can be answered and
 * tested without infrastructure (CLAUDE.md §5).
 * ============================================================================
 */

export const SECTION_KEYS = [
  'executive_summary',
  'objectives',
  'actions',
  'deliverables',
  'results',
  'objectives_comparison',
  'analysis',
  'insights',
  'attention_points',
  'recommendations',
  'next_steps',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

export type ReportType =
  | 'weekly_internal'
  | 'monthly'
  | 'project'
  | 'client'
  | 'campaign_review'
  | 'period_review'

export type ReportStatusValue = 'draft' | 'in_review' | 'published' | 'archived'

/**
 * Which sections a report of each type starts with, in order.
 *
 * A weekly internal note and a monthly client report are not the same document
 * and should not open with the same eleven empty boxes. Every type still
 * ALLOWS every section — this is the starting point, not a cage.
 */
const DEFAULT_SECTIONS: Record<ReportType, readonly SectionKey[]> = {
  // For the team, on a Friday. No executive summary: they were there.
  weekly_internal: ['actions', 'deliverables', 'attention_points', 'next_steps'],
  monthly: [
    'executive_summary',
    'objectives_comparison',
    'results',
    'deliverables',
    'analysis',
    'insights',
    'recommendations',
    'next_steps',
  ],
  project: [
    'executive_summary',
    'objectives',
    'actions',
    'deliverables',
    'results',
    'attention_points',
    'next_steps',
  ],
  client: [
    'executive_summary',
    'objectives_comparison',
    'deliverables',
    'results',
    'analysis',
    'recommendations',
    'next_steps',
  ],
  campaign_review: [
    'executive_summary',
    'results',
    'objectives_comparison',
    'analysis',
    'insights',
    'recommendations',
  ],
  period_review: [
    'executive_summary',
    'objectives_comparison',
    'results',
    'analysis',
    'insights',
    'attention_points',
    'recommendations',
    'next_steps',
  ],
}

export function defaultSectionsFor(type: ReportType): readonly SectionKey[] {
  return DEFAULT_SECTIONS[type]
}

/**
 * Sections a client never sees, whatever the editor is set to.
 *
 * `attention_points` is the team's own list of what is going wrong. It is the
 * report's equivalent of `what_didnt` on an insight (ADR-065): the agency
 * chooses to have that conversation, a default must not have it for them.
 */
const INTERNAL_SECTIONS = new Set<SectionKey>(['attention_points'])

export function isInternalSection(key: SectionKey): boolean {
  return INTERNAL_SECTIONS.has(key)
}

/**
 * Whether a section starts out visible to the client.
 *
 * Internal sections start hidden AND the editor refuses to reveal them; the
 * rest start visible, because a report whose every section must be ticked on
 * is a report nobody finishes.
 */
export function defaultClientVisibility(key: SectionKey): boolean {
  return !isInternalSection(key)
}

/**
 * ============================================================================
 * The report's life.
 *
 * `published` is the one transition that matters: it freezes the data into a
 * snapshot (ADR-014). Everything after reads the snapshot.
 * ============================================================================
 */
const TRANSITIONS: Record<ReportStatusValue, readonly ReportStatusValue[]> = {
  draft: ['in_review', 'published'],
  in_review: ['draft', 'published'],
  // A published report is not edited: correcting one means publishing a new
  // one, which the interface says out loud. Archiving is the only way out.
  published: ['archived'],
  archived: [],
}

export function allowedTransitions(from: ReportStatusValue): readonly ReportStatusValue[] {
  return TRANSITIONS[from]
}

export function canTransition(from: ReportStatusValue, to: ReportStatusValue): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * A published report is frozen (ADR-014).
 *
 * Not a style rule: the PDF in the client's inbox and the page on their screen
 * must say the same thing, and the only way to guarantee that is to make the
 * source unchangeable.
 */
export function isEditable(status: ReportStatusValue): boolean {
  return status === 'draft' || status === 'in_review'
}

export function isShareable(status: ReportStatusValue): boolean {
  return status === 'published'
}

export function statusTone(
  status: ReportStatusValue,
): 'neutral' | 'progress' | 'success' | 'warning' {
  if (status === 'published') return 'success'
  if (status === 'in_review') return 'progress'
  if (status === 'archived') return 'neutral'
  return 'neutral'
}

/**
 * ============================================================================
 * Share links.
 * ============================================================================
 */

/** Seven days. Long enough to read a report, short enough that a forwarded mail goes stale. */
export const DEFAULT_SHARE_DAYS = 7
export const MAX_SHARE_DAYS = 90

export function shareExpiryFrom(now: Date, days = DEFAULT_SHARE_DAYS): Date {
  const clamped = Math.max(1, Math.min(MAX_SHARE_DAYS, Math.round(days)))
  return new Date(now.getTime() + clamped * 86_400_000)
}

export type ShareVerdict =
  | { ok: true }
  | { ok: false; reason: 'revoked' | 'expired' | 'password_required' | 'password_wrong' }

/**
 * Whether a share link may be opened right now.
 *
 * Every refusal carries its REASON, because "this link has expired" and "this
 * link was revoked" are different things to tell a person, and neither is
 * "not found" (ADR-041).
 *
 * Revocation is checked BEFORE expiry: a link that was revoked was revoked,
 * and saying "expired" would understate what happened.
 */
export function checkShare(
  share: { revokedAt: Date | null; expiresAt: Date; passwordHash: string | null },
  input: { now: Date; passwordMatches: boolean | null },
): ShareVerdict {
  if (share.revokedAt) return { ok: false, reason: 'revoked' }
  if (share.expiresAt.getTime() <= input.now.getTime()) return { ok: false, reason: 'expired' }

  if (share.passwordHash) {
    if (input.passwordMatches === null) return { ok: false, reason: 'password_required' }
    if (!input.passwordMatches) return { ok: false, reason: 'password_wrong' }
  }

  return { ok: true }
}

/**
 * The sections a share link may show.
 *
 * Two filters, both required: included in the report at all, AND marked
 * client-visible. An internal section is dropped even if somebody ticked it,
 * because `isInternalSection` is the last word.
 */
export function sharedSections<
  T extends { key: SectionKey; isIncluded: boolean; isClientVisible: boolean },
>(sections: readonly T[]): T[] {
  return sections.filter(
    (section) => section.isIncluded && section.isClientVisible && !isInternalSection(section.key),
  )
}

/** The sections an internal reader sees: everything that is included. */
export function includedSections<T extends { isIncluded: boolean; sortOrder: number }>(
  sections: readonly T[],
): T[] {
  return [...sections]
    .filter((section) => section.isIncluded)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * ============================================================================
 * THE SCHEDULED DRAFTS — "every Friday" and "end of month" (roadmap LOT 12.9).
 *
 * The period a scheduled report covers is pure arithmetic on a calendar, so it
 * is decided here rather than in the job: a job that computed its own window
 * would be testable only by waiting for a Friday.
 *
 * Both windows are computed in the ORGANISATION's time zone. "The week that
 * just ended" is a different week in Abidjan and in Paris at 23:30 UTC on a
 * Friday, and getting that wrong drops a day of work out of a report (R9).
 * ============================================================================
 */
export type ScheduleKind = 'weekly' | 'monthly'

export type ScheduledPeriod = {
  kind: ScheduleKind
  type: ReportType
  periodStart: string
  periodEnd: string
  /** The date a title is built around: the Monday of the week, or the month. */
  anchor: string
}

export function scheduledPeriod(kind: ScheduleKind, now: Date, timezone: string): ScheduledPeriod {
  const today = calendarDay(now, timezone)

  if (kind === 'weekly') {
    // Monday to Sunday of the week `now` falls in — run on a Friday, it is the
    // week being closed, not the one before it.
    const monday = addDays(today, -((dayOfWeek(today) + 6) % 7))

    return {
      kind,
      // An internal weekly point, not a client deliverable: the team reads it.
      type: 'weekly_internal',
      periodStart: monday,
      periodEnd: addDays(monday, 6),
      anchor: monday,
    }
  }

  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const first = `${today.slice(0, 7)}-01`

  return {
    kind,
    type: 'monthly',
    periodStart: first,
    periodEnd: lastDayOfMonth(year, month),
    anchor: first,
  }
}

/** `YYYY-MM-DD` for the calendar day `value` falls on in `timezone`. */
export function calendarDay(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(value)
}

/** 0 = Sunday, as `Date.getUTCDay`. The input is a calendar day, so UTC is exact. */
function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay()
}

function addDays(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the NEXT month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(year, month, 0))
  return last.toISOString().slice(0, 10)
}
