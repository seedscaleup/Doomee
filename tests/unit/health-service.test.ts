import { describe, expect, it } from 'vitest'
import {
  computeHealth,
  DEFAULT_HEALTH_WEIGHTS,
  HEALTH_FACTORS,
  type HealthInput,
  healthTone,
  normaliseWeights,
  riskTone,
  statusFor,
  worstFactors,
} from '@/modules/health/service'

/** A project where nothing is wrong. Every test starts here and breaks one thing. */
const healthy: HealthInput = {
  progressPercent: 60,
  scheduleElapsedPercent: 55,
  actionsTotal: 20,
  actionsOverdue: 0,
  actionsBlocked: 0,
  deliverablesPendingClient: 0,
  oldestPendingClientDays: 0,
  openRisks: 0,
  criticalRisks: 0,
  busiestAssigneeOpenActions: 3,
  doneActionsWithoutResult: 0,
  milestonesOverdue: 0,
  milestonesTotal: 4,
}

const input = (overrides: Partial<HealthInput> = {}): HealthInput => ({ ...healthy, ...overrides })
const read = (overrides: Partial<HealthInput> = {}) =>
  computeHealth(input(overrides), DEFAULT_HEALTH_WEIGHTS)

describe('the weights', () => {
  it('sums the defaults to exactly one', () => {
    const total = HEALTH_FACTORS.reduce((sum, code) => sum + DEFAULT_HEALTH_WEIGHTS[code], 0)
    expect(total).toBeCloseTo(1, 10)
  })

  /**
   * A weight map that sums to 1.4 would produce scores above 100, and nobody
   * would notice until a dashboard showed 137 %.
   */
  it('normalises whatever an organisation put in its settings', () => {
    const weights = normaliseWeights({ overdue_actions: 10, open_risks: 10 })
    const total = HEALTH_FACTORS.reduce((sum, code) => sum + weights[code], 0)

    expect(total).toBeCloseTo(1, 10)
    expect(weights.overdue_actions).toBeCloseTo(0.5, 10)
    expect(weights.progress_vs_schedule).toBe(0)
  })

  /** A negative weight would mean "being late improves the score". */
  it('refuses a negative weight', () => {
    const weights = normaliseWeights({ overdue_actions: -5, open_risks: 5 })
    expect(weights.overdue_actions).toBe(0)
    expect(weights.open_risks).toBeCloseTo(1, 10)
  })

  it('falls back to the defaults rather than dividing by zero', () => {
    expect(normaliseWeights({})).toEqual(DEFAULT_HEALTH_WEIGHTS)
    expect(normaliseWeights(null)).toEqual(DEFAULT_HEALTH_WEIGHTS)
    expect(normaliseWeights({ overdue_actions: 0 })).toEqual(DEFAULT_HEALTH_WEIGHTS)
  })

  it('ignores a weight that is not a number', () => {
    const weights = normaliseWeights({ overdue_actions: Number.NaN, open_risks: 1 })
    expect(weights.open_risks).toBeCloseTo(1, 10)
  })
})

describe('the score', () => {
  it('gives a project where nothing is wrong a high score', () => {
    const reading = read()
    expect(reading.score).toBeGreaterThanOrEqual(95)
    expect(reading.status).toBe('healthy')
  })

  it('never leaves 0–100, whatever the inputs', () => {
    const disaster = read({
      progressPercent: 0,
      scheduleElapsedPercent: 100,
      actionsOverdue: 20,
      actionsBlocked: 12,
      deliverablesPendingClient: 9,
      oldestPendingClientDays: 90,
      openRisks: 15,
      criticalRisks: 9,
      busiestAssigneeOpenActions: 40,
      doneActionsWithoutResult: 30,
      milestonesOverdue: 4,
    })

    expect(disaster.score).toBeGreaterThanOrEqual(0)
    expect(disaster.score).toBeLessThanOrEqual(100)
    expect(disaster.status).toBe('blocked')
  })

  it('returns all eight factors, every time', () => {
    expect(read().factors.map((factor) => factor.code)).toEqual([...HEALTH_FACTORS])
  })

  /** A number without its reasons is a number nobody can act on. */
  it('carries the params each sentence needs', () => {
    const reading = read({ actionsOverdue: 5 })
    const factor = reading.factors.find((item) => item.code === 'overdue_actions')

    expect(factor?.params).toEqual({ count: 5, total: 20 })
  })
})

describe('the eight factors, one at a time', () => {
  /**
   * The single most useful thing this score says: 60 % of the time gone and
   * 20 % of the work done.
   */
  it('notices work falling behind the calendar', () => {
    const behind = read({ progressPercent: 20, scheduleElapsedPercent: 60 })
    const factor = behind.factors.find((item) => item.code === 'progress_vs_schedule')

    expect(factor?.score).toBe(20)
    expect(factor?.params.gap).toBe(40)
  })

  /** Ahead of schedule is not BETTER than on schedule. */
  it('caps a project that is ahead at 100', () => {
    const ahead = read({ progressPercent: 90, scheduleElapsedPercent: 20 })
    expect(ahead.factors.find((item) => item.code === 'progress_vs_schedule')?.score).toBe(100)
  })

  /** A missing input must never look like a problem. */
  it('does not punish a project that has no dates', () => {
    const undated = read({ scheduleElapsedPercent: null })
    const factor = undated.factors.find((item) => item.code === 'progress_vs_schedule')

    expect(factor?.score).toBe(100)
    expect(factor?.params).toEqual({})
  })

  it('scores overdue actions as a proportion, not a count', () => {
    const few = read({ actionsTotal: 100, actionsOverdue: 2 })
    const many = read({ actionsTotal: 10, actionsOverdue: 2 })

    const scoreOf = (reading: ReturnType<typeof read>) =>
      reading.factors.find((item) => item.code === 'overdue_actions')?.score

    // The same two late actions: trivial out of a hundred, serious out of ten.
    expect(scoreOf(few)).toBeGreaterThan(scoreOf(many) ?? 0)
  })

  it('scores an empty project’s actions as fine rather than as zero', () => {
    const empty = read({ actionsTotal: 0, actionsOverdue: 0 })
    expect(empty.factors.find((item) => item.code === 'overdue_actions')?.score).toBe(100)
  })

  /**
   * Counted in DAYS waiting, not in deliverables: one thing waiting three
   * weeks is a problem, five things waiting since this morning are not.
   */
  it('measures a pending validation by how long it has waited', () => {
    const fresh = read({ deliverablesPendingClient: 5, oldestPendingClientDays: 0 })
    const stale = read({ deliverablesPendingClient: 1, oldestPendingClientDays: 21 })

    const scoreOf = (reading: ReturnType<typeof read>) =>
      reading.factors.find((item) => item.code === 'pending_validation')?.score

    expect(scoreOf(fresh)).toBe(100)
    expect(scoreOf(stale)).toBe(0)
  })

  it('weighs a critical risk more than an ordinary one', () => {
    const ordinary = read({ openRisks: 3, criticalRisks: 0 })
    const critical = read({ openRisks: 3, criticalRisks: 3 })

    const scoreOf = (reading: ReturnType<typeof read>) =>
      reading.factors.find((item) => item.code === 'open_risks')?.score

    expect(scoreOf(critical)).toBeLessThan(scoreOf(ordinary) ?? 100)
  })

  /** A bus factor of one is a risk the project does not know it has. */
  it('stays silent about a reasonable workload and speaks about a lopsided one', () => {
    const balanced = read({ busiestAssigneeOpenActions: 5 })
    const lopsided = read({ busiestAssigneeOpenActions: 15 })

    const scoreOf = (reading: ReturnType<typeof read>) =>
      reading.factors.find((item) => item.code === 'workload')?.score

    expect(scoreOf(balanced)).toBe(100)
    expect(scoreOf(lopsided)).toBe(0)
  })

  /**
   * The factor that makes this a DOOMEE score rather than a project-management
   * one: an agency that ships without measuring is not healthy, however
   * punctual it is.
   */
  it('penalises finished work with nothing recorded about it', () => {
    const measured = read({ doneActionsWithoutResult: 0 })
    const unmeasured = read({ doneActionsWithoutResult: 4 })

    const scoreOf = (reading: ReturnType<typeof read>) =>
      reading.factors.find((item) => item.code === 'missing_results')?.score

    expect(scoreOf(measured)).toBe(100)
    expect(scoreOf(unmeasured)).toBe(40)
    expect(unmeasured.score).toBeLessThan(measured.score)
  })
})

describe('the status', () => {
  /**
   * An 82/100 that cannot move is not "healthy", and a status that said so
   * would teach people to ignore the status.
   */
  it('calls a project with a blocked action blocked, whatever its score', () => {
    const reading = read({ actionsBlocked: 1 })
    expect(statusFor(95, input({ actionsBlocked: 1 }))).toBe('blocked')
    expect(reading.status).toBe('blocked')
  })

  it('calls a project with a critical risk blocked', () => {
    expect(statusFor(98, input({ criticalRisks: 1 }))).toBe('blocked')
  })

  it('uses the thresholds when nothing is stopped', () => {
    expect(statusFor(85, input())).toBe('healthy')
    expect(statusFor(80, input())).toBe('healthy')
    expect(statusFor(79, input())).toBe('at_risk')
    expect(statusFor(60, input())).toBe('at_risk')
    expect(statusFor(59, input())).toBe('blocked')
  })

  it('gives each status a tone', () => {
    expect(healthTone('healthy')).toBe('success')
    expect(healthTone('at_risk')).toBe('warning')
    expect(healthTone('blocked')).toBe('danger')
  })

  it('gives each risk level a tone', () => {
    expect(riskTone('critical')).toBe('danger')
    expect(riskTone('medium')).toBe('warning')
    expect(riskTone('low')).toBe('neutral')
  })
})

describe('which factors to show first', () => {
  /**
   * Sorted by points LOST, not by raw score. A factor at 40 with a weight of
   * 0.05 costs three points; a factor at 80 with a weight of 0.2 costs four.
   * The second one is the one to fix.
   */
  it('ranks by points lost, not by raw score', () => {
    const reading = computeHealth(
      input({ doneActionsWithoutResult: 4, progressPercent: 45, scheduleElapsedPercent: 55 }),
      DEFAULT_HEALTH_WEIGHTS,
    )

    const worst = worstFactors(reading, 2)
    const lost = worst.map((factor) => (100 - factor.score) * factor.weight)

    expect(lost[0]).toBeGreaterThanOrEqual(lost[1] ?? 0)
    // missing_results is at 40 but weighs 0.05; the schedule gap weighs 0.20.
    expect(worst[0]?.code).toBe('progress_vs_schedule')
  })

  it('shows nothing when nothing is wrong', () => {
    expect(worstFactors(read())).toEqual([])
  })

  it('never returns more than asked for', () => {
    const reading = read({
      actionsOverdue: 6,
      actionsBlocked: 2,
      openRisks: 4,
      doneActionsWithoutResult: 3,
      milestonesOverdue: 2,
    })
    expect(worstFactors(reading, 3)).toHaveLength(3)
  })
})
