/**
 * Shapes shared between the server and the browser. No server import here, so
 * a client component can take a row type without dragging `server-only` into
 * the bundle (ADR-030).
 */
export type { LoopCounts, LoopStage, LoopStep } from './service'

export type InsightRow = {
  id: string
  title: string
  projectId: string | null
  projectName: string | null
  clientId: string | null
  clientName: string | null
  whatWorked: string | null
  whatDidnt: string | null
  whatWeLearned: string | null
  recommendation: string | null
  periodStart: string | null
  periodEnd: string | null
  isClientVisible: boolean
  authorName: string | null
  createdAt: string
  /** How many results this insight is built on — an insight with none is an opinion. */
  resultCount: number
  /** How many actions came out of it — the loop closing. */
  actionCount: number
}

export type LinkedResultRow = {
  id: string
  title: string | null
  recordedFor: string
  projectName: string
}

export type LinkedActionRow = {
  id: string
  title: string
  status: string
  assigneeName: string | null
}

export type ProjectOption = { id: string; name: string }
export type ClientOption = { id: string; name: string }
export type ResultOption = { id: string; label: string; projectId: string }
