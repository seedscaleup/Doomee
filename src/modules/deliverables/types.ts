/**
 * Shapes shared between the server and the browser. No server import here, so a
 * client component can take a row type without dragging `server-only` into the
 * bundle (ADR-030).
 */
export type { DeliverableStatusValue, Side, TransitionRefusal } from './service'

export type DeliverableRow = {
  id: string
  title: string
  status: import('./service').DeliverableStatusValue
  projectId: string
  projectName: string
  clientName: string | null
  typeLabels: Record<string, string> | null
  ownerName: string | null
  dueDate: string | null
  isClientVisible: boolean
  versionCount: number
  currentVersion: number | null
}

export type DeliverableDetail = DeliverableRow & {
  description: string | null
  actionId: string | null
  actionTitle: string | null
  deliverableTypeId: string | null
  ownerUserId: string | null
  externalUrl: string | null
  sentToClientAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  /** The project's timezone, so "late" is read where the project lives (R9). */
  timezone: string
}

export type VersionRow = {
  id: string
  version: number
  notes: string | null
  externalUrl: string | null
  filename: string | null
  mimeType: string | null
  sizeBytes: number | null
  /** Minted after the permission check, and it expires (R13). */
  url: string | null
  createdByName: string | null
  createdAt: string
}

export type ReviewRow = {
  id: string
  scope: 'internal' | 'client'
  decision: 'approved' | 'changes_requested'
  comment: string | null
  version: number
  reviewerName: string | null
  createdAt: string
}

export type TaxonomyOption = { id: string; code: string; labels: Record<string, string> }
export type PersonOption = { userId: string; name: string }
export type ProjectOption = { id: string; name: string; timezone: string }
