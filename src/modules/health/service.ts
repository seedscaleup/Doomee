/**
 * ============================================================================
 * THE PROJECT HEALTH SCORE.
 *
 * Pure: counts in, a score and its reasons out. No database, no request
 * context — which is what lets every factor be tested on its own, and what
 * lets the same computation run in a nightly job and in a request without two
 * implementations drifting apart (CLAUDE.md §5).
 *
 * 🔒 INTERNAL ONLY (ADR-025). Nothing in this file may reach a client portal
 * view, and `project_health_snapshots` has no portal.* view at all.
 * ============================================================================
 */

/** The eight factors of the MVP (docs/database.md §8). */
export const HEALTH_FACTORS = [
  'progress_vs_schedule',
  'overdue_actions',
  'deadline_compliance',
  'pending_validation',
  'open_risks',
  'blocked_actions',
  'workload',
  'missing_results',
] as const

export type HealthFactor = (typeof HEALTH_FACTORS)[number]

/** Weights live in `organizations.settings.health.weights` (rule 7 — no hard-coded business data). */
export type HealthWeights = Record<HealthFactor, number>

/**
 * The defaults, seeded into every new organisation.
 *
 * They sum to 1, and `normaliseWeights` enforces that whatever an organisation
 * puts in its settings also does — a weight map that sums to 1.4 would produce
 * scores above 100 and nobody would notice until a dashboard showed 137 %.
 */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  progress_vs_schedule: 0.2,
  overdue_actions: 0.2,
  deadline_compliance: 0.15,
  pending_validation: 0.15,
  open_risks: 0.1,
  blocked_actions: 0.1,
  workload: 0.05,
  missing_results: 0.05,
}

/**
 * Everything the score is computed from.
 *
 * Plain numbers, deliberately: the service must not know what a project or an
 * action IS. That keeps it testable, and keeps "how do we score a project"
 * separate from "how do we query one".
 */
export type HealthInput = {
  /** 0–100, as stored on the project. */
  progressPercent: number
  /** 0–100: how much of the project's calendar has elapsed. Null when it has no dates. */
  scheduleElapsedPercent: number | null
  actionsTotal: number
  actionsOverdue: number
  actionsBlocked: number
  /** Deliverables sitting in `client_review`. */
  deliverablesPendingClient: number
  /** How long the oldest one has been waiting, in days. */
  oldestPendingClientDays: number
  openRisks: number
  criticalRisks: number
  /** Open actions assigned to the busiest single person on the project. */
  busiestAssigneeOpenActions: number
  /** Completed actions with no result recorded — the loop left unfinished. */
  doneActionsWithoutResult: number
  /** Milestones whose due date has passed without being reached. */
  milestonesOverdue: number
  milestonesTotal: number
}

export type FactorScore = {
  code: HealthFactor
  weight: number
  /** 0–100. 100 is healthy. */
  score: number
  /** What the i18n catalogue needs to write the sentence (ADR-011). */
  params: Record<string, number>
}

export type HealthReading = {
  score: number
  status: 'healthy' | 'at_risk' | 'blocked'
  factors: FactorScore[]
}

/**
 * Makes a weight map usable, whatever an organisation put in its settings.
 *
 * Missing factors fall back to the default. Negative weights become zero — a
 * negative weight would mean "being late improves the score". The result is
 * then normalised so the weights sum to 1, which is what keeps the final score
 * inside 0–100 no matter what anyone typed.
 *
 * All zeroes falls back to the defaults rather than dividing by zero: an
 * organisation that disabled every factor has not asked for a score of NaN.
 */
export function normaliseWeights(
  partial: Partial<HealthWeights> | null | undefined,
): HealthWeights {
  const raw = HEALTH_FACTORS.map((code) => {
    const value = partial?.[code]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  })

  const total = raw.reduce((sum, value) => sum + value, 0)
  if (total === 0) return { ...DEFAULT_HEALTH_WEIGHTS }

  const weights = {} as HealthWeights
  HEALTH_FACTORS.forEach((code, index) => {
    weights[code] = (raw[index] ?? 0) / total
  })
  return weights
}

/**
 * The score, and the reason for every point lost.
 *
 * The factors are returned WITH the score, not derivable from it: a number
 * without its reasons is a number nobody can act on, and recomputing the
 * reasons later would mean recomputing them against different data.
 */
export function computeHealth(input: HealthInput, weights: HealthWeights): HealthReading {
  const factors: FactorScore[] = [
    progressVsSchedule(input),
    overdueActions(input),
    deadlineCompliance(input),
    pendingValidation(input),
    openRisks(input),
    blockedActions(input),
    workload(input),
    missingResults(input),
  ].map((factor) => ({ ...factor, weight: weights[factor.code] }))

  const score = Math.round(
    factors.reduce((total, factor) => total + factor.score * factor.weight, 0),
  )

  return { score: clamp(score), status: statusFor(clamp(score), input), factors }
}

/**
 * The status is NOT just a threshold on the score.
 *
 * A project with blocked actions is blocked, whatever its average says — an
 * 82/100 that cannot move is not "healthy", and a status that said so would
 * teach people to ignore the status.
 */
export function statusFor(score: number, input: HealthInput): HealthReading['status'] {
  if (input.actionsBlocked > 0 || input.criticalRisks > 0) return 'blocked'
  if (score < 60) return 'blocked'
  if (score < 80) return 'at_risk'
  return 'healthy'
}

/**
 * ============================================================================
 * The eight factors. Each returns 0–100, where 100 is healthy, and the params
 * the sentence needs.
 *
 * Every one of them answers "what would a manager notice?", not "what is easy
 * to count".
 * ============================================================================
 */

/**
 * Is the work keeping up with the calendar?
 *
 * 60 % of the time gone and 60 % of the work done is on track. 60 % of the
 * time and 20 % of the work is the single most useful thing this score says.
 *
 * A project with no dates cannot be late against a schedule it does not have,
 * so it scores full marks rather than zero — a missing input must never look
 * like a problem.
 */
function progressVsSchedule(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'progress_vs_schedule' as const
  if (input.scheduleElapsedPercent === null) {
    return { code, score: 100, params: {} }
  }

  const elapsed = clamp(input.scheduleElapsedPercent)
  const progress = clamp(input.progressPercent)
  const gap = elapsed - progress

  // Ahead of schedule is not better than on schedule: 100 is the ceiling.
  const score = gap <= 0 ? 100 : clamp(100 - gap * 2)
  return { code, score, params: { gap: Math.round(Math.max(gap, 0)), elapsed, progress } }
}

/** How much of the work is late. */
function overdueActions(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'overdue_actions' as const
  if (input.actionsTotal === 0) return { code, score: 100, params: { count: 0 } }

  const ratio = input.actionsOverdue / input.actionsTotal
  return {
    code,
    // A fifth of the actions late is already a score of 0: "half the project
    // is late" and "the whole project is late" are the same emergency.
    score: clamp(100 - ratio * 500),
    params: { count: input.actionsOverdue, total: input.actionsTotal },
  }
}

/** Milestones that came and went. */
function deadlineCompliance(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'deadline_compliance' as const
  if (input.milestonesTotal === 0) return { code, score: 100, params: { count: 0 } }

  const ratio = input.milestonesOverdue / input.milestonesTotal
  return {
    code,
    score: clamp(100 - ratio * 200),
    params: { count: input.milestonesOverdue, total: input.milestonesTotal },
  }
}

/**
 * Work sitting on the client's desk.
 *
 * Counted in DAYS waiting, not in deliverables: one thing waiting three weeks
 * is a problem, five things waiting since this morning are not.
 */
function pendingValidation(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'pending_validation' as const
  if (input.deliverablesPendingClient === 0) {
    return { code, score: 100, params: { count: 0, days: 0 } }
  }

  // A week of silence costs half the factor; a fortnight costs all of it.
  const score = clamp(100 - input.oldestPendingClientDays * 7)
  return {
    code,
    score,
    params: { count: input.deliverablesPendingClient, days: input.oldestPendingClientDays },
  }
}

/** Risks someone wrote down and nobody closed. */
function openRisks(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'open_risks' as const
  // A critical risk weighs as much as three ordinary ones, and one is enough
  // to cost most of the factor.
  const weighted = input.openRisks + input.criticalRisks * 2
  return {
    code,
    score: clamp(100 - weighted * 20),
    params: { count: input.openRisks, critical: input.criticalRisks },
  }
}

/**
 * Work that cannot move.
 *
 * Harsher than "late" on purpose: a late action is behind, a blocked action is
 * stopped, and somebody has to do something about it today.
 */
function blockedActions(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'blocked_actions' as const
  return {
    code,
    score: clamp(100 - input.actionsBlocked * 34),
    params: { count: input.actionsBlocked },
  }
}

/**
 * Is one person carrying the project alone?
 *
 * A bus factor of one is a risk the project does not know it has. Below five
 * open actions on one person this is silent.
 */
function workload(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'workload' as const
  const excess = Math.max(0, input.busiestAssigneeOpenActions - 5)
  return {
    code,
    score: clamp(100 - excess * 10),
    params: { count: input.busiestAssigneeOpenActions },
  }
}

/**
 * Work finished, and nothing recorded about what it produced.
 *
 * This is the factor that makes the health score a DOOMEE score rather than a
 * project-management one: an agency that ships without measuring is not
 * healthy, however punctual it is.
 */
function missingResults(input: HealthInput): Omit<FactorScore, 'weight'> {
  const code = 'missing_results' as const
  const done = input.doneActionsWithoutResult
  if (done === 0) return { code, score: 100, params: { count: 0 } }

  return { code, score: clamp(100 - done * 15), params: { count: done } }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * The factors worth showing first: the ones actually costing points.
 *
 * Sorted by points LOST (weight × distance from 100), not by raw score — a
 * factor at 40 with a weight of 0.05 costs three points, and a factor at 80
 * with a weight of 0.2 costs four. The second one is the one to fix.
 */
export function worstFactors(reading: HealthReading, count = 3): FactorScore[] {
  return [...reading.factors]
    .filter((factor) => factor.score < 100)
    .sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight)
    .slice(0, count)
}

export function healthTone(status: HealthReading['status']): 'success' | 'warning' | 'danger' {
  if (status === 'healthy') return 'success'
  if (status === 'at_risk') return 'warning'
  return 'danger'
}

export function riskTone(level: 'low' | 'medium' | 'critical'): 'neutral' | 'warning' | 'danger' {
  if (level === 'critical') return 'danger'
  if (level === 'medium') return 'warning'
  return 'neutral'
}
