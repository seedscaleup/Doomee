/**
 * Pure client rules. No database, no request context — this is what the unit
 * tests exercise without any infrastructure (CLAUDE.md §5).
 */
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'archived'

/**
 * Which statuses a client may move to.
 *
 * Archived is deliberately a dead end from the UI: bringing a client back is a
 * decision, not a dropdown, and it goes through an explicit restore action.
 */
const TRANSITIONS: Record<ClientStatus, readonly ClientStatus[]> = {
  prospect: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
}

export function canTransition(from: ClientStatus, to: ClientStatus): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: ClientStatus): readonly ClientStatus[] {
  return TRANSITIONS[from]
}

/** The tone a status badge takes. Kept here so every screen agrees. */
export function statusTone(status: ClientStatus): 'neutral' | 'progress' | 'success' | 'warning' {
  switch (status) {
    case 'prospect':
      return 'progress'
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'archived':
      return 'neutral'
  }
}

/**
 * Accent-insensitive, case-insensitive search.
 *
 * "cote" must find "Côte d'Ivoire": in French a search that requires the right
 * accent is a search that fails.
 */
export function normaliseSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * A client is archivable only when nothing depends on it being live.
 * Projects arrive in LOT 4; the shape is here so the rule has one home.
 */
export function canArchive(counts: { activeProjects: number }): {
  allowed: boolean
  reason?: 'has_active_projects'
} {
  if (counts.activeProjects > 0) return { allowed: false, reason: 'has_active_projects' }
  return { allowed: true }
}
