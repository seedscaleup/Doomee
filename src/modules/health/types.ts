/**
 * Shapes shared between the server and the browser. No server import here, so
 * a client component can take a row type without dragging `server-only` into
 * the bundle (ADR-030).
 */
export type {
  FactorScore,
  HealthFactor,
  HealthInput,
  HealthReading,
  HealthWeights,
} from './service'

export type RiskRow = {
  id: string
  projectId: string
  projectName: string
  clientName: string | null
  kind: 'risk' | 'issue'
  title: string
  description: string | null
  level: 'low' | 'medium' | 'critical'
  impact: string | null
  probability: string | null
  ownerUserId: string | null
  ownerName: string | null
  identifiedOn: string | null
  mitigationPlan: string | null
  status: 'open' | 'mitigated' | 'closed'
  isClientVisible: boolean
}

/** One project's health, as stored — plus the factors that explain it. */
export type ProjectHealthRow = {
  projectId: string
  projectName: string
  score: number | null
  status: 'healthy' | 'at_risk' | 'blocked' | null
  computedAt: string | null
  factors: { code: string; weight: number; score: number; params: Record<string, number> }[]
}

/**
 * ============================================================================
 * THE ALERT CENTRE.
 *
 * Four kinds, each one a thing somebody has to do something about today. Not a
 * feed: a feed is read once and then ignored.
 * ============================================================================
 */
export type AlertKind =
  | 'overdue_action'
  | 'pending_validation'
  | 'project_at_risk'
  | 'objective_behind'

export type AlertRow = {
  kind: AlertKind
  id: string
  title: string
  projectId: string
  projectName: string
  /** What the i18n catalogue needs to write the sentence (ADR-011). */
  params: Record<string, number>
  href: string
}

export type ProjectOption = { id: string; name: string }
export type PersonOption = { userId: string; name: string }
