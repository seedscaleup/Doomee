/**
 * Metrics computed from other metrics — CTR, CPC, CPL, ROAS, ROI, conversion
 * rate.
 *
 * Derived AT READ TIME, never stored (ADR-047). A stored ratio contradicts its
 * own numerator the first time one of them is corrected, and the correction is
 * exactly the moment a number matters.
 *
 * Pure: values in, values out. No database, no formula parser — the formulas in
 * `metrics.formula` are documentation of what this file implements, and a test
 * checks the two agree rather than letting them drift.
 */
export type MetricValues = Record<string, number | undefined>

export type DerivedMetric = {
  code: string
  /** The codes it needs. Missing any of them means the metric is not shown. */
  inputs: readonly string[]
  /** Mirrors `metrics.formula` — kept next to the code that implements it. */
  formula: string
  compute: (values: MetricValues) => number | null
}

/**
 * Division that refuses rather than returns Infinity.
 *
 * A CTR of ∞ because impressions were not recorded is worse than no CTR: it
 * looks like a measurement.
 */
function ratio(numerator: number | undefined, denominator: number | undefined): number | null {
  if (numerator === undefined || denominator === undefined) return null
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator === 0) return null
  return numerator / denominator
}

function percent(numerator: number | undefined, denominator: number | undefined): number | null {
  const value = ratio(numerator, denominator)
  return value === null ? null : round4(value * 100)
}

export const DERIVED_METRICS: readonly DerivedMetric[] = [
  {
    code: 'ctr',
    inputs: ['clicks', 'impressions'],
    formula: 'clicks / impressions',
    compute: (values) => percent(values.clicks, values.impressions),
  },
  {
    code: 'conversion_rate',
    inputs: ['sales', 'leads'],
    formula: 'sales / leads',
    compute: (values) => percent(values.sales, values.leads),
  },
  {
    code: 'cpl',
    inputs: ['spend', 'leads'],
    formula: 'spend / leads',
    compute: (values) => {
      const value = ratio(values.spend, values.leads)
      return value === null ? null : round4(value)
    },
  },
  {
    code: 'cpc',
    inputs: ['spend', 'clicks'],
    formula: 'spend / clicks',
    compute: (values) => {
      const value = ratio(values.spend, values.clicks)
      return value === null ? null : round4(value)
    },
  },
  {
    code: 'roas',
    inputs: ['revenue', 'spend'],
    formula: 'revenue / spend',
    compute: (values) => {
      const value = ratio(values.revenue, values.spend)
      return value === null ? null : round4(value)
    },
  },
  {
    code: 'roi',
    inputs: ['revenue', 'spend'],
    formula: '(revenue - spend) / spend',
    compute: (values) => {
      if (values.revenue === undefined || values.spend === undefined) return null
      return percent(values.revenue - values.spend, values.spend)
    },
  },
]

/**
 * Every derived metric that CAN be computed from what was recorded.
 *
 * Absent rather than zero when an input is missing: "0% CTR" and "we did not
 * count impressions" are different facts, and only one of them is bad news.
 */
export function deriveMetrics(values: MetricValues): Record<string, number> {
  const derived: Record<string, number> = {}

  for (const metric of DERIVED_METRICS) {
    const value = metric.compute(values)
    if (value !== null) derived[metric.code] = value
  }

  return derived
}

/** The derived metrics that would appear, for showing what is still missing. */
export function missingInputsFor(code: string, values: MetricValues): string[] {
  const metric = DERIVED_METRICS.find((item) => item.code === code)
  if (!metric) return []
  return metric.inputs.filter((input) => values[input] === undefined)
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
