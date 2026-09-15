/**
 * Shapes shared between the server and the browser. No server import here, so a
 * client component can take a row type without dragging `server-only` into the
 * bundle (ADR-030).
 */
export type { FieldKind, FormField, FormTemplate, RawFormValues } from './form-engine'

export type ResultNoteKind =
  | 'observation'
  | 'audience_feedback'
  | 'client_feedback'
  | 'difficulty'
  | 'positive'
  | 'negative'
  | 'learning'
  | 'opportunity'

export type ResultRow = {
  id: string
  title: string | null
  recordedFor: string
  projectId: string
  projectName: string
  clientName: string | null
  actionId: string | null
  actionTitle: string | null
  analysis: string | null
  recommendation: string | null
  isClientVisible: boolean
  recordedByName: string | null
  metricCount: number
}

export type ResultMetricRow = {
  metricId: string
  metricCode: string
  metricLabels: Record<string, string>
  fieldKey: string
  value: string
  unit: string | null
  currency: string | null
  decimals: number
}

export type ResultNoteRow = {
  id: string
  kind: ResultNoteKind
  body: string
}

/** One metric, aggregated over a period — what the Results module shows. */
export type MetricTotal = {
  metricId: string
  code: string
  labels: Record<string, string>
  kind: string
  direction: string
  decimals: number
  unit: string | null
  /** Aggregated with the metric's own `aggregation`, never blindly summed. */
  total: number
  /** The same aggregate over the preceding window of equal length. */
  previous: number | null
  samples: number
}

/** One project's standing on a single metric, over the window. */
export type PerformanceRow = {
  projectId: string
  projectName: string
  clientName: string | null
  value: number
  samples: number
}

/** What the Results filters can be set to, scoped to what the reader may see. */
export type FilterOptions = {
  projects: { id: string; name: string }[]
  clients: { id: string; name: string }[]
  channels: { id: string; labels: Record<string, string> }[]
  actionTypes: { id: string; labels: Record<string, string> }[]
  people: { id: string; name: string }[]
}
