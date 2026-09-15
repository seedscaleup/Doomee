/**
 * Pure objective logic: the gap between what was aimed at and what happened.
 *
 * No database, no clock of its own — every input is an argument (CLAUDE.md §5).
 * This is the arithmetic the whole "did it work?" question rests on, so it is
 * tested on its own rather than through a screen.
 */

export type ObjectiveStatusValue = 'draft' | 'active' | 'achieved' | 'missed' | 'cancelled'
export type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'neutral'

const TRANSITIONS: Record<ObjectiveStatusValue, readonly ObjectiveStatusValue[]> = {
  draft: ['active', 'cancelled'],
  // Achieved and missed are verdicts, and a verdict can be revisited while the
  // period is still open — a late result changes the answer.
  active: ['achieved', 'missed', 'cancelled', 'draft'],
  achieved: ['active', 'missed'],
  missed: ['active', 'achieved'],
  cancelled: ['draft'],
}

export function allowedTransitions(from: ObjectiveStatusValue): readonly ObjectiveStatusValue[] {
  return TRANSITIONS[from]
}

export function canTransition(from: ObjectiveStatusValue, to: ObjectiveStatusValue): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

export function statusTone(
  status: ObjectiveStatusValue,
): 'neutral' | 'progress' | 'success' | 'danger' {
  if (status === 'achieved') return 'success'
  if (status === 'missed') return 'danger'
  if (status === 'active') return 'progress'
  return 'neutral'
}

/**
 * ============================================================================
 * THE GAP.
 *
 * Deliberately a discriminated union rather than a number-or-null: "we could
 * not compute this" has reasons, and an interface that shows `—` for both
 * "nothing measured yet" and "you are comparing euros to francs" is an
 * interface that hides a mistake (ADR-024).
 * ============================================================================
 */
export type GapInput = {
  targetValue: number | null
  currentValue: number | null
  direction: MetricDirection
  /** Set only when the target is money. */
  targetCurrency?: string | null
  currentCurrency?: string | null
}

export type Gap =
  | {
      computed: true
      /** current − target. Negative means below the target, whatever that means. */
      difference: number
      achievementPercent: number
      /** Whether the difference is good news, which depends on the direction. */
      verdict: 'ahead' | 'on_track' | 'behind'
    }
  | { computed: false; reason: 'no_target' | 'no_result' | 'currency_mismatch' | 'zero_target' }

/** Within this much of the target, "on track" says more than a signed number. */
const ON_TRACK_TOLERANCE_PERCENT = 5

export function computeGap(input: GapInput): Gap {
  /**
   * Two different currencies is not a small number problem, it is a category
   * error: 1 000 EUR and 1 000 XOF are not comparable and no exchange rate
   * exists in this product (ADR-024). Refusing loudly beats a plausible wrong
   * answer, which is the failure mode that ends up in a client report.
   */
  if (
    input.targetCurrency &&
    input.currentCurrency &&
    input.targetCurrency !== input.currentCurrency
  ) {
    return { computed: false, reason: 'currency_mismatch' }
  }

  if (input.targetValue === null) return { computed: false, reason: 'no_target' }
  if (input.currentValue === null) return { computed: false, reason: 'no_result' }

  // Dividing by it would give Infinity, and "∞% of target" helps nobody.
  if (input.targetValue === 0) return { computed: false, reason: 'zero_target' }

  const difference = input.currentValue - input.targetValue
  const achievementPercent = Math.round((input.currentValue / input.targetValue) * 100)

  return {
    computed: true,
    difference: round4(difference),
    achievementPercent,
    verdict: verdictFor(achievementPercent, input.direction),
  }
}

/**
 * 120% of a revenue target is ahead; 120% of a cost-per-lead target is behind.
 * This is the whole reason `direction` is a column on `metrics` rather than an
 * assumption in a chart.
 */
function verdictFor(
  achievementPercent: number,
  direction: MetricDirection,
): 'ahead' | 'on_track' | 'behind' {
  const distance = achievementPercent - 100
  if (Math.abs(distance) <= ON_TRACK_TOLERANCE_PERCENT) return 'on_track'

  if (direction === 'lower_is_better') return distance < 0 ? 'ahead' : 'behind'
  if (direction === 'neutral') return 'on_track'
  return distance > 0 ? 'ahead' : 'behind'
}

/** The tone a gap should be shown in. One place, so no screen invents its own. */
export function gapTone(gap: Gap): 'neutral' | 'success' | 'warning' | 'danger' {
  if (!gap.computed) return gap.reason === 'currency_mismatch' ? 'danger' : 'neutral'
  if (gap.verdict === 'ahead') return 'success'
  if (gap.verdict === 'on_track') return 'neutral'
  return 'warning'
}

/**
 * Where a period sits relative to a day — used to explain a gap rather than
 * just show it. Being at 60% halfway through is not the same as being at 60%
 * on the last day.
 */
export type PeriodStanding = 'not_started' | 'running' | 'ended' | 'undated'

export function periodStanding(
  period: { periodStart: string | null; periodEnd: string | null },
  today: string,
): PeriodStanding {
  if (!period.periodStart && !period.periodEnd) return 'undated'
  if (period.periodStart && today < period.periodStart) return 'not_started'
  if (period.periodEnd && today > period.periodEnd) return 'ended'
  return 'running'
}

/**
 * How far through the period we are, 0 to 100.
 *
 * Compared against `achievementPercent`, this is what turns a number into a
 * judgement: 40% achieved at 90% elapsed is behind even if nobody said so.
 */
export function periodElapsedPercent(
  period: { periodStart: string | null; periodEnd: string | null },
  today: string,
): number | null {
  if (!period.periodStart || !period.periodEnd) return null

  const start = Date.parse(`${period.periodStart}T00:00:00Z`)
  const end = Date.parse(`${period.periodEnd}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(now)) return null
  if (end <= start) return null

  const ratio = (now - start) / (end - start)
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

/**
 * The verdict an objective would get if it were judged right now.
 *
 * Suggested, never applied automatically: a status is something a human sets,
 * and a project that misses a target on paper may have been renegotiated. The
 * screen offers it; the mutation still requires the click.
 */
export function suggestedStatus(gap: Gap, standing: PeriodStanding): ObjectiveStatusValue | null {
  if (!gap.computed) return null
  if (standing !== 'ended') return null
  return gap.verdict === 'behind' ? 'missed' : 'achieved'
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * A stored numeric(20,4) arrives from the driver as a string, because a
 * JavaScript number cannot hold every value the column can. Parsing it in one
 * place keeps "is it a string or a number?" out of every caller.
 */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
