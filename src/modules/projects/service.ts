/**
 * Pure project logic. No database, no request context, no clock of its own:
 * every input is an argument, which is what makes the timezone rules below
 * testable at all (CLAUDE.md §5).
 */

export type ProjectStatusValue =
  | 'to_start'
  | 'in_progress'
  | 'in_review'
  | 'paused'
  | 'blocked'
  | 'done'
  | 'archived'

export type MilestoneStatusValue = 'upcoming' | 'reached' | 'missed'

/**
 * Where a project may go from where it is.
 *
 * Written as data rather than as a chain of ifs, so the whole machine is
 * readable at once and the interface can offer exactly the moves that exist.
 */
const TRANSITIONS: Record<ProjectStatusValue, readonly ProjectStatusValue[]> = {
  to_start: ['in_progress', 'paused', 'blocked', 'archived'],
  in_progress: ['in_review', 'paused', 'blocked', 'done', 'archived'],
  in_review: ['in_progress', 'done', 'blocked', 'archived'],
  // Paused and blocked are interruptions, not endings: they return to work.
  paused: ['in_progress', 'to_start', 'archived'],
  blocked: ['in_progress', 'paused', 'archived'],
  // A finished project can be reopened; an archived one is put away for good
  // and comes back only by being un-archived, which is its own decision.
  done: ['in_progress', 'archived'],
  archived: [],
}

export function allowedTransitions(from: ProjectStatusValue): readonly ProjectStatusValue[] {
  return TRANSITIONS[from]
}

export function canTransition(from: ProjectStatusValue, to: ProjectStatusValue): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

/** Which projects still count as live work, for filters and for counters. */
export function isActive(status: ProjectStatusValue): boolean {
  return status !== 'done' && status !== 'archived'
}

export function statusTone(
  status: ProjectStatusValue,
): 'neutral' | 'progress' | 'success' | 'danger' {
  if (status === 'done') return 'success'
  if (status === 'blocked') return 'danger'
  if (status === 'in_progress' || status === 'in_review') return 'progress'
  return 'neutral'
}

export function priorityTone(
  priority: 'low' | 'normal' | 'high' | 'urgent',
): 'neutral' | 'progress' | 'warning' | 'danger' {
  if (priority === 'urgent') return 'danger'
  if (priority === 'high') return 'warning'
  if (priority === 'low') return 'neutral'
  return 'progress'
}

/**
 * The calendar date in a given timezone — 'YYYY-MM-DD'.
 *
 * "Late" is a question about a calendar DAY. A deadline of the 15th is not
 * missed at 23:00 on the 14th in Abidjan just because it is already the 15th in
 * Paris (R9). Intl does the conversion; doing it by hand with offsets is how
 * daylight saving quietly breaks a report twice a year.
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

/** A due date is late once the project's own day has moved past it. */
export function isOverdue(
  dueDate: string | null | undefined,
  timezone: string,
  now: Date,
): boolean {
  if (!dueDate) return false
  return dueDate < calendarDate(now, timezone)
}

/** Days remaining, counted in the project's timezone. Negative once late. */
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

/**
 * What a milestone's status SHOULD be, given the clock.
 *
 * Reached is a fact someone recorded and the clock never undoes it. Everything
 * else is derived, so a milestone does not need a nightly job to stop lying.
 */
export function milestoneStatusFor(
  milestone: { dueDate: string | null; reachedAt: Date | string | null },
  timezone: string,
  now: Date,
): MilestoneStatusValue {
  if (milestone.reachedAt) return 'reached'
  return isOverdue(milestone.dueDate, timezone, now) ? 'missed' : 'upcoming'
}

export type ProgressCounts = {
  actionsTotal: number
  actionsDone: number
  milestonesTotal: number
  milestonesReached: number
}

/**
 * How far along a project is, as a whole percent.
 *
 * Actions are the unit of work, so they decide as soon as there are any.
 * Milestones are the fallback for a project that has been planned but not yet
 * broken down — the state every project passes through on its first day, and
 * the one where showing a flat 0% would be both true and useless.
 *
 * Returns 0 rather than null when nothing is known: a progress bar is a
 * measurement of work done, and no work done is 0, not "unknown".
 */
export function projectProgress(counts: ProgressCounts): number {
  if (counts.actionsTotal > 0) return percent(counts.actionsDone, counts.actionsTotal)
  if (counts.milestonesTotal > 0) return percent(counts.milestonesReached, counts.milestonesTotal)
  return 0
}

function percent(done: number, total: number): number {
  if (total <= 0) return 0

  const ratio = Math.min(Math.max(done, 0), total) / total
  const value = Math.round(ratio * 100)

  // Never round a partially done project up to 100 or down to 0: the two ends
  // of the bar mean "nothing yet" and "finished", and neither is true here.
  if (value === 100 && done < total) return 99
  if (value === 0 && done > 0) return 1
  return value
}
