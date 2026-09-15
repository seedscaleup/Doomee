import { describe, expect, it } from 'vitest'
import { METRIC_SEED } from '@/db/seed/metrics'
import { DERIVED_METRICS, deriveMetrics, missingInputsFor } from '@/modules/results/derived-metrics'

describe('metrics derived from other metrics', () => {
  it('computes CTR as a percentage of impressions', () => {
    expect(deriveMetrics({ clicks: 50, impressions: 1000 }).ctr).toBe(5)
  })

  it('computes the money ratios', () => {
    const derived = deriveMetrics({ spend: 1000, leads: 20, clicks: 500, revenue: 4000 })
    expect(derived.cpl).toBe(50)
    expect(derived.cpc).toBe(2)
    expect(derived.roas).toBe(4)
    expect(derived.roi).toBe(300)
  })

  it('computes the conversion rate from sales over leads', () => {
    expect(deriveMetrics({ sales: 5, leads: 20 }).conversion_rate).toBe(25)
  })

  it('refuses to divide by zero rather than reporting infinity', () => {
    // A CTR of ∞ because impressions were not counted is worse than no CTR:
    // it looks like a measurement.
    const derived = deriveMetrics({ clicks: 50, impressions: 0 })
    expect(derived.ctr).toBeUndefined()
  })

  it('omits a metric whose inputs are missing, rather than showing zero', () => {
    const derived = deriveMetrics({ clicks: 50 })
    expect(derived.ctr).toBeUndefined()
    expect(Object.keys(derived)).toEqual([])
  })

  it('says which inputs are missing', () => {
    expect(missingInputsFor('ctr', { clicks: 10 })).toEqual(['impressions'])
    expect(missingInputsFor('ctr', { clicks: 10, impressions: 100 })).toEqual([])
    expect(missingInputsFor('nonsense', {})).toEqual([])
  })

  it('handles a loss without pretending it is a gain', () => {
    // Spent 1000, made 400: a ROI of −60%, not 60%.
    expect(deriveMetrics({ revenue: 400, spend: 1000 }).roi).toBe(-60)
    expect(deriveMetrics({ revenue: 400, spend: 1000 }).roas).toBe(0.4)
  })

  it('rounds to four decimals, like the column that would store it', () => {
    expect(deriveMetrics({ clicks: 1, impressions: 3 }).ctr).toBe(33.3333)
  })

  it('treats a non-finite input as no input', () => {
    expect(deriveMetrics({ clicks: Number.NaN, impressions: 100 }).ctr).toBeUndefined()
  })
})

/**
 * The formulas live in two places — `metrics.formula` in the seed, and the
 * implementation here. That is on purpose: the column documents the metric for
 * a reader, the code computes it. This test is what keeps the two honest.
 */
describe('the seeded formulas and the implementations agree', () => {
  it('declares the same formula on both sides', () => {
    for (const derived of DERIVED_METRICS) {
      const seeded = METRIC_SEED.find((metric) => metric.code === derived.code)
      expect(seeded, derived.code).toBeDefined()
      expect(seeded?.formula, derived.code).toBe(derived.formula)
    }
  })

  it('implements every metric the seed marks as computed', () => {
    const computed = METRIC_SEED.filter((metric) => metric.isComputed).map((metric) => metric.code)
    const implemented = DERIVED_METRICS.map((metric) => metric.code)

    expect(implemented.sort()).toEqual(computed.sort())
  })
})
