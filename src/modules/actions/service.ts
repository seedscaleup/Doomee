import { addDays, calendarDate, isOverdue } from '@/lib/dates'

/**
 * Pure action logic. No database, no request context, no clock of its own —
 * every input is an argument (CLAUDE.md §5).
 *
 * The date rules reuse the project module's, deliberately: "late" is one
 * question with one answer in this product, and a second implementation of it
 * would be a second set of edge cases at the daylight-saving boundary (R9,
 * ADR-039).
 */
export type ActionStatusValue =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'blocked'
  | 'cancelled'

export type PriorityValue = 'low' | 'normal' | 'high' | 'urgent'

/**
 * Where an action may go from where it is.
 *
 * Data rather than a chain of ifs, so the machine is readable at once and the
 * interface can offer exactly the moves that exist.
 */
const TRANSITIONS: Record<ActionStatusValue, readonly ActionStatusValue[]> = {
  todo: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['in_review', 'done', 'blocked', 'todo', 'cancelled'],
  in_review: ['done', 'in_progress', 'blocked', 'cancelled'],
  // Blocked is an interruption, not an ending: it goes back to work.
  blocked: ['todo', 'in_progress', 'cancelled'],
  // Done and cancelled can be reopened — a result that turns out wrong, a
  // decision reversed — but only back to active work, never to each other.
  done: ['in_progress'],
  cancelled: ['todo'],
}

export function allowedTransitions(from: ActionStatusValue): readonly ActionStatusValue[] {
  return TRANSITIONS[from]
}

export function canTransition(from: ActionStatusValue, to: ActionStatusValue): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

/** Work that still counts: not finished, not abandoned. */
export function isOpen(status: ActionStatusValue): boolean {
  return status !== 'done' && status !== 'cancelled'
}

/** Only `done` counts as done. Cancelled work was not done, it was dropped. */
export function isDone(status: ActionStatusValue): boolean {
  return status === 'done'
}

export function statusTone(
  status: ActionStatusValue,
): 'neutral' | 'progress' | 'success' | 'danger' {
  if (status === 'done') return 'success'
  if (status === 'blocked') return 'danger'
  if (status === 'in_progress' || status === 'in_review') return 'progress'
  return 'neutral'
}

/**
 * A blocked action must say why.
 *
 * "Blocked" without a reason is the status that rots a board: nobody knows what
 * to unblock, so nobody does. The rule lives here rather than in a Zod schema
 * because it is conditional on the status, and because it is worth testing on
 * its own.
 */
export type BlockVerdict = { ok: true } | { ok: false; reason: 'reason_required' }

export function checkBlocked(input: {
  status: ActionStatusValue
  blockedReason?: string | null
}): BlockVerdict {
  if (input.status !== 'blocked') return { ok: true }
  const reason = (input.blockedReason ?? '').trim()
  return reason.length > 0 ? { ok: true } : { ok: false, reason: 'reason_required' }
}

/**
 * ============================================================================
 * LATENESS — the same question the project module answers, asked about an
 * action, in the PROJECT's timezone (R9).
 * ============================================================================
 */
export type ActionTiming = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** A finished action is never late: it is finished. */
export function actionIsOverdue(
  action: { status: ActionStatusValue; dueDate?: string | null },
  timezone: string,
  now: Date,
): boolean {
  if (!isOpen(action.status)) return false
  return isOverdue(action.dueDate, timezone, now)
}

/**
 * Where an action sits on the horizon. Used by My Work and by Focus Mode, so
 * both answer "what is urgent" the same way.
 *
 * `soon` is the next seven days INCLUDING today's tomorrow — a week is how
 * people plan, and a horizon that stopped at the calendar week would call
 * Monday "later" when read on a Friday.
 */
export function timingOf(
  action: { status: ActionStatusValue; dueDate?: string | null },
  timezone: string,
  now: Date,
): ActionTiming {
  if (!action.dueDate || !isOpen(action.status)) return 'none'

  const today = calendarDate(now, timezone)
  if (action.dueDate < today) return 'overdue'
  if (action.dueDate === today) return 'today'

  return action.dueDate <= addDays(today, 7) ? 'soon' : 'later'
}

/**
 * ============================================================================
 * ORDERING — one rule, used by every list.
 *
 * Late first, then today, then by deadline, then by priority. A list sorted by
 * creation date tells the reader nothing about what to do next, which is the
 * only thing My Work exists to say.
 * ============================================================================
 */
const TIMING_RANK: Record<ActionTiming, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
}

const PRIORITY_RANK: Record<PriorityValue, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export type SortableAction = {
  id: string
  status: ActionStatusValue
  priority: PriorityValue
  dueDate?: string | null
  title: string
}

export function byUrgency<T extends SortableAction>(
  actions: readonly T[],
  timezone: string,
  now: Date,
): T[] {
  return [...actions].sort((left, right) => {
    const timing =
      TIMING_RANK[timingOf(left, timezone, now)] - TIMING_RANK[timingOf(right, timezone, now)]
    if (timing !== 0) return timing

    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    if (priority !== 0) return priority

    // Among equals, the nearest deadline. Undated work sorts last: it is not
    // more urgent for having no date, it is less decided.
    if (left.dueDate !== right.dueDate) {
      if (!left.dueDate) return 1
      if (!right.dueDate) return -1
      return left.dueDate < right.dueDate ? -1 : 1
    }

    return left.title.localeCompare(right.title)
  })
}

/**
 * ============================================================================
 * FOCUS MODE — three to five actions, one screen at a time.
 *
 * The cap is the feature. A "focus" list of twenty is a backlog with a new
 * name; five is what someone can actually hold. Below three there is nothing to
 * focus on, so the mode simply does not open.
 * ============================================================================
 */
export const FOCUS_MIN = 3
export const FOCUS_MAX = 5

export function focusSelection<T extends SortableAction>(
  actions: readonly T[],
  timezone: string,
  now: Date,
): T[] {
  return byUrgency(
    actions.filter((action) => isOpen(action.status)),
    timezone,
    now,
  ).slice(0, FOCUS_MAX)
}

/** Whether entering Focus Mode would show anything worth focusing on. */
export function canFocus(count: number): boolean {
  return count >= FOCUS_MIN
}

/**
 * ============================================================================
 * MY WORK — the same actions, cut into the three questions people ask.
 * ============================================================================
 */
export type MyWorkBuckets<T> = {
  overdue: T[]
  today: T[]
  soon: T[]
  later: T[]
}

export function bucketByTiming<T extends SortableAction>(
  actions: readonly T[],
  timezone: string,
  now: Date,
): MyWorkBuckets<T> {
  const open = byUrgency(
    actions.filter((action) => isOpen(action.status)),
    timezone,
    now,
  )

  return {
    overdue: open.filter((action) => timingOf(action, timezone, now) === 'overdue'),
    today: open.filter((action) => timingOf(action, timezone, now) === 'today'),
    soon: open.filter((action) => timingOf(action, timezone, now) === 'soon'),
    // Undated work belongs here too: it is not urgent, but it is not invisible.
    later: open.filter((action) => {
      const timing = timingOf(action, timezone, now)
      return timing === 'later' || timing === 'none'
    }),
  }
}

/**
 * ============================================================================
 * KANBAN — the columns, and what belongs in each.
 * ============================================================================
 */
export const KANBAN_COLUMNS: readonly ActionStatusValue[] = [
  'todo',
  'in_progress',
  'in_review',
  'done',
]

export function groupByStatus<T extends SortableAction>(
  actions: readonly T[],
  timezone: string,
  now: Date,
): Record<ActionStatusValue, T[]> {
  const sorted = byUrgency(actions, timezone, now)
  const empty = {
    todo: [] as T[],
    in_progress: [] as T[],
    in_review: [] as T[],
    done: [] as T[],
    blocked: [] as T[],
    cancelled: [] as T[],
  }

  for (const action of sorted) empty[action.status].push(action)
  return empty
}

/**
 * The project counters an action change implies (ADR-013).
 *
 * Pure, so the arithmetic is tested without a database; the mutation writes the
 * result inside its own transaction.
 */
export function actionCounts(
  actions: readonly { status: ActionStatusValue; dueDate?: string | null }[],
  timezone: string,
  now: Date,
): { actionsTotal: number; actionsDone: number; actionsOverdue: number } {
  // Cancelled work is not part of the denominator: counting it would make a
  // project look less finished for having dropped what it should drop.
  const counted = actions.filter((action) => action.status !== 'cancelled')

  return {
    actionsTotal: counted.length,
    actionsDone: counted.filter((action) => isDone(action.status)).length,
    actionsOverdue: counted.filter((action) => actionIsOverdue(action, timezone, now)).length,
  }
}
