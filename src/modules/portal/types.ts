/**
 * Shapes shared between the portal's server layer and its screens. No server
 * import here, so a client component can take a row type without dragging
 * `server-only` into the bundle (ADR-030).
 */
export type PortalClient = { id: string; name: string; slug: string }

export type PortalProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  clientId: string | null
  clientName: string | null
  startDate: string | null
  endDate: string | null
  timezone: string
  progressPercent: number
  /** Deliverables waiting on THIS client's decision — the portal's call to action. */
  awaitingDecision: number
}

export type PortalDeliverableRow = {
  id: string
  projectId: string
  projectName: string
  title: string
  description: string | null
  status: string
  typeLabels: Record<string, string> | null
  dueDate: string | null
  sentToClientAt: string | null
  version: number | null
  versionId: string | null
  externalUrl: string | null
  fileName: string | null
  /** Minted after the permission check, and it expires (R13). */
  fileUrl: string | null
}

export type PortalReviewRow = {
  id: string
  scope: string
  decision: string
  comment: string | null
  version: number
  createdAt: string
}

export type PortalResultRow = {
  id: string
  projectId: string
  projectName: string
  title: string | null
  recordedFor: string
  analysis: string | null
  recommendation: string | null
  metrics: PortalMetricRow[]
}

export type PortalMetricRow = {
  metricId: string
  labels: Record<string, string>
  value: string
  unit: string | null
  currency: string | null
  decimals: number
}

export type PortalObjectiveRow = {
  id: string
  projectId: string
  title: string
  metricLabels: Record<string, string> | null
  targetValue: string | null
  currentValue: string | null
  currency: string | null
  status: string
  periodStart: string | null
  periodEnd: string | null
  decimals: number
}

export type PortalCommentRow = {
  id: string
  body: string
  authorName: string | null
  createdAt: string
  projectId: string | null
}

export type PortalEventRow = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}
