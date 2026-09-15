/**
 * Shapes shared between the server and the browser. No server import here, so a
 * client component can take a row type without dragging `server-only` into the
 * bundle (ADR-030).
 */
export type ActionStatusValue =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'blocked'
  | 'cancelled'

export type PriorityValue = 'low' | 'normal' | 'high' | 'urgent'

export type ActionRow = {
  id: string
  title: string
  status: ActionStatusValue
  priority: PriorityValue
  dueDate: string | null
  projectId: string
  projectName: string
  /** The project's timezone: what "late" is measured against (ADR-039). */
  timezone: string
  assigneeId: string | null
  assigneeName: string | null
  isClientVisible: boolean
  collaboratorCount: number
}

export type ActionDetail = ActionRow & {
  description: string | null
  startDate: string | null
  actionTypeId: string | null
  categoryId: string | null
  channelId: string | null
  estimatedMinutes: number | null
  spentMinutes: number | null
  blockedReason: string | null
  completedAt: string | null
}

export type CommentRow = {
  id: string
  body: string
  visibility: 'internal' | 'shared'
  authorName: string | null
  createdAt: string
  mentions: string[]
}

export type AttachmentRow = {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  /** Signed, short-lived, minted after the permission check (R13). */
  url: string
}

export type TaxonomyOption = {
  id: string
  code: string
  labels: Record<string, string>
}

export type ProjectOption = { id: string; name: string; timezone: string }
export type PersonOption = { userId: string; name: string }
