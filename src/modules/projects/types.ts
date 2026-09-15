/**
 * Shapes shared between the server and the browser. No server import here, so
 * a client component can take a row type without dragging `server-only` into
 * the bundle (ADR-030).
 */
export type ProjectStatusValue =
  | 'to_start'
  | 'in_progress'
  | 'in_review'
  | 'paused'
  | 'blocked'
  | 'done'
  | 'archived'

export type PriorityValue = 'low' | 'normal' | 'high' | 'urgent'
export type ProjectMemberRoleValue = 'lead' | 'member' | 'reviewer'

export type ProjectRow = {
  id: string
  name: string
  code: string | null
  status: ProjectStatusValue
  priority: PriorityValue
  clientId: string | null
  clientName: string | null
  ownerName: string | null
  endDate: string | null
  timezone: string
  progressPercent: number
  actionsTotal: number
  actionsDone: number
  memberCount: number
}

export type ProjectDetail = {
  id: string
  name: string
  code: string | null
  description: string | null
  status: ProjectStatusValue
  priority: PriorityValue
  color: string | null
  clientId: string | null
  clientName: string | null
  ownerUserId: string | null
  ownerName: string | null
  startDate: string | null
  endDate: string | null
  timezone: string
  budgetAmount: string | null
  budgetCurrency: string | null
  isClientVisible: boolean
  progressPercent: number
  actionsTotal: number
  actionsDone: number
  actionsOverdue: number
}

export type ProjectMemberRow = {
  userId: string
  name: string
  email: string
  role: ProjectMemberRoleValue
}

export type MilestoneRow = {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  isClientVisible: boolean
  /** An instant, serialised for the browser: the row's own status is derived. */
  reachedAt: string | null
}

export type ClientOption = { id: string; name: string }
export type ColleagueOption = { userId: string; name: string }
