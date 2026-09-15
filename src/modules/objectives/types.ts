/**
 * Shapes shared between the server and the browser. No server import here, so a
 * client component can take a row type without dragging `server-only` into the
 * bundle (ADR-030).
 */
export type ObjectiveStatusValue = 'draft' | 'active' | 'achieved' | 'missed' | 'cancelled'
export type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'neutral'
export type MetricKind = 'integer' | 'decimal' | 'currency' | 'percent' | 'ratio' | 'duration'

export type MetricOption = {
  id: string
  code: string
  labels: Record<string, string>
  unit: string | null
  kind: MetricKind
  direction: MetricDirection
  decimals: number
  isComputed: boolean
}

export type ObjectiveRow = {
  id: string
  title: string
  description: string | null
  status: ObjectiveStatusValue
  projectId: string
  projectName: string
  objectiveTypeId: string | null
  objectiveTypeLabels: Record<string, string> | null
  metricId: string | null
  metricLabels: Record<string, string> | null
  /** Carried on the row so a gap can be judged without a second lookup. */
  metricDirection: MetricDirection | null
  metricKind: MetricKind | null
  metricDecimals: number | null
  /** numeric(20,4) arrives as a string: a JS number cannot hold every value. */
  targetValue: string | null
  currentValue: string | null
  unit: string | null
  currency: string | null
  periodStart: string | null
  periodEnd: string | null
  ownerUserId: string | null
  ownerName: string | null
  isClientVisible: boolean
  achievementPercent: number | null
}

export type TaxonomyOption = { id: string; code: string; labels: Record<string, string> }
export type PersonOption = { userId: string; name: string }
