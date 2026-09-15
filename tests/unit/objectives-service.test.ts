import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  canTransition,
  computeGap,
  gapTone,
  type ObjectiveStatusValue,
  periodElapsedPercent,
  periodStanding,
  statusTone,
  suggestedStatus,
  toNumber,
} from '@/modules/objectives/service'

describe('the objective status machine', () => {
  it('starts as a draft and becomes active', () => {
    expect(canTransition('draft', 'active')).toBe(true)
  })

  it('lets a verdict be revisited: a late result changes the answer', () => {
    expect(canTransition('achieved', 'missed')).toBe(true)
    expect(canTransition('missed', 'achieved')).toBe(true)
    expect(canTransition('achieved', 'active')).toBe(true)
  })

  it('refuses to judge an objective nobody activated', () => {
    expect(canTransition('draft', 'achieved')).toBe(false)
    expect(canTransition('draft', 'missed')).toBe(false)
  })

  it('offers only moves it would then accept', () => {
    const statuses: ObjectiveStatusValue[] = ['draft', 'active', 'achieved', 'missed', 'cancelled']
    for (const from of statuses) {
      for (const to of allowedTransitions(from)) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
      }
    }
  })

  it('gives achieved and missed the tones a reader expects', () => {
    expect(statusTone('achieved')).toBe('success')
    expect(statusTone('missed')).toBe('danger')
    expect(statusTone('draft')).toBe('neutral')
  })
})

describe('the gap between the target and the result', () => {
  const base = { direction: 'higher_is_better' as const }

  it('computes the difference and the percentage', () => {
    expect(computeGap({ ...base, targetValue: 1000, currentValue: 750 })).toEqual({
      computed: true,
      difference: -250,
      achievementPercent: 75,
      verdict: 'behind',
    })
  })

  it('calls it ahead when more is better and there is more', () => {
    const gap = computeGap({ ...base, targetValue: 100, currentValue: 130 })
    expect(gap).toMatchObject({ verdict: 'ahead', achievementPercent: 130 })
  })

  it('calls the SAME numbers behind when less is better', () => {
    // 130% of a cost-per-lead target is not a success, and this is the whole
    // reason `direction` is a column on `metrics`.
    const gap = computeGap({
      targetValue: 100,
      currentValue: 130,
      direction: 'lower_is_better',
    })
    expect(gap).toMatchObject({ verdict: 'behind' })

    const under = computeGap({
      targetValue: 100,
      currentValue: 70,
      direction: 'lower_is_better',
    })
    expect(under).toMatchObject({ verdict: 'ahead' })
  })

  it('treats a near miss as on track rather than as a failure', () => {
    expect(computeGap({ ...base, targetValue: 100, currentValue: 97 })).toMatchObject({
      verdict: 'on_track',
    })
    expect(computeGap({ ...base, targetValue: 100, currentValue: 104 })).toMatchObject({
      verdict: 'on_track',
    })
  })

  it('has no verdict for a neutral metric', () => {
    expect(computeGap({ targetValue: 100, currentValue: 300, direction: 'neutral' })).toMatchObject(
      { verdict: 'on_track' },
    )
  })

  it('says WHY it could not compute, rather than showing a dash', () => {
    expect(computeGap({ ...base, targetValue: null, currentValue: 10 })).toEqual({
      computed: false,
      reason: 'no_target',
    })
    expect(computeGap({ ...base, targetValue: 10, currentValue: null })).toEqual({
      computed: false,
      reason: 'no_result',
    })
    expect(computeGap({ ...base, targetValue: 0, currentValue: 10 })).toEqual({
      computed: false,
      reason: 'zero_target',
    })
  })

  it('REFUSES to compare two currencies, and says so (ADR-024)', () => {
    expect(
      computeGap({
        ...base,
        targetValue: 5_000_000,
        currentValue: 7_500,
        targetCurrency: 'XOF',
        currentCurrency: 'EUR',
      }),
    ).toEqual({ computed: false, reason: 'currency_mismatch' })
  })

  it('compares happily when the currency matches', () => {
    expect(
      computeGap({
        ...base,
        targetValue: 5_000_000,
        currentValue: 6_000_000,
        targetCurrency: 'XOF',
        currentCurrency: 'XOF',
      }),
    ).toMatchObject({ verdict: 'ahead', achievementPercent: 120 })
  })

  it('checks the currency BEFORE anything else', () => {
    // Mismatched currencies with no result yet must report the mismatch: fixing
    // "no result" first would hide a comparison that can never be made.
    expect(
      computeGap({
        ...base,
        targetValue: 100,
        currentValue: null,
        targetCurrency: 'EUR',
        currentCurrency: 'XOF',
      }),
    ).toEqual({ computed: false, reason: 'currency_mismatch' })
  })

  it('ignores a currency on only one side: nothing to mismatch', () => {
    expect(
      computeGap({ ...base, targetValue: 100, currentValue: 120, targetCurrency: 'EUR' }),
    ).toMatchObject({ verdict: 'ahead' })
  })

  it('shows a currency mismatch as an error, not as an absence', () => {
    expect(gapTone({ computed: false, reason: 'currency_mismatch' })).toBe('danger')
    expect(gapTone({ computed: false, reason: 'no_result' })).toBe('neutral')
    expect(
      gapTone({ computed: true, difference: 5, achievementPercent: 120, verdict: 'ahead' }),
    ).toBe('success')
    expect(
      gapTone({ computed: true, difference: -50, achievementPercent: 50, verdict: 'behind' }),
    ).toBe('warning')
  })
})

describe('where the period stands', () => {
  const period = { periodStart: '2026-01-01', periodEnd: '2026-03-31' }

  it('knows before, during and after', () => {
    expect(periodStanding(period, '2025-12-31')).toBe('not_started')
    expect(periodStanding(period, '2026-02-15')).toBe('running')
    expect(periodStanding(period, '2026-04-01')).toBe('ended')
  })

  it('says undated rather than guessing', () => {
    expect(periodStanding({ periodStart: null, periodEnd: null }, '2026-02-15')).toBe('undated')
  })

  it('measures how far through it is', () => {
    expect(periodElapsedPercent(period, '2026-01-01')).toBe(0)
    expect(periodElapsedPercent(period, '2026-03-31')).toBe(100)

    // A ten-day period, so the midpoint is unambiguous — 1 Jan to 31 Mar is
    // 89 days, and its "half" is not a round date.
    const short = { periodStart: '2026-01-01', periodEnd: '2026-01-11' }
    expect(periodElapsedPercent(short, '2026-01-06')).toBe(50)
    expect(periodElapsedPercent(short, '2026-01-03')).toBe(20)
  })

  it('clamps rather than reporting a negative or a 300%', () => {
    expect(periodElapsedPercent(period, '2025-01-01')).toBe(0)
    expect(periodElapsedPercent(period, '2027-01-01')).toBe(100)
  })

  it('declines a period that cannot be measured', () => {
    expect(
      periodElapsedPercent({ periodStart: '2026-01-01', periodEnd: null }, '2026-02-01'),
    ).toBeNull()
    expect(
      periodElapsedPercent({ periodStart: '2026-03-01', periodEnd: '2026-01-01' }, '2026-02-01'),
    ).toBeNull()
  })
})

describe('the status an objective would get today', () => {
  const ahead = computeGap({ targetValue: 100, currentValue: 130, direction: 'higher_is_better' })
  const behind = computeGap({ targetValue: 100, currentValue: 40, direction: 'higher_is_better' })

  it('suggests nothing while the period is still running', () => {
    expect(suggestedStatus(ahead, 'running')).toBeNull()
    expect(suggestedStatus(behind, 'running')).toBeNull()
  })

  it('suggests a verdict once the period has ended', () => {
    expect(suggestedStatus(ahead, 'ended')).toBe('achieved')
    expect(suggestedStatus(behind, 'ended')).toBe('missed')
  })

  it('suggests nothing it cannot compute', () => {
    expect(suggestedStatus({ computed: false, reason: 'no_result' }, 'ended')).toBeNull()
    expect(suggestedStatus({ computed: false, reason: 'currency_mismatch' }, 'ended')).toBeNull()
  })
})

describe('reading a numeric column', () => {
  it('parses the string the driver returns for numeric(20,4)', () => {
    expect(toNumber('5000.2500')).toBe(5000.25)
    expect(toNumber(42)).toBe(42)
  })

  it('treats absent and unparsable as nothing, not as zero', () => {
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('not a number')).toBeNull()
  })
})
