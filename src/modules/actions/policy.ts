/**
 * Who may change WHICH action.
 *
 * The permission matrix answers "may this role edit actions at all". It cannot
 * answer "may this person edit THIS one", because that depends on the row — and
 * `action.update_own` is meaningless without the second half.
 *
 * Pure, and it takes the verdict of `can()` rather than an Actor: the matrix
 * stays the single source of what a role may do, and this file stays testable
 * without one.
 */
export type ActionViewer = {
  userId: string
  /** can(actor, 'action.update_any') — decided by the matrix, not here. */
  canUpdateAny: boolean
}

export type ActionOwnership = {
  assigneeId: string | null
  createdBy: string | null
  collaboratorIds?: readonly string[]
}

/**
 * "Own" means accountable for it, or asked to help with it, or the one who
 * wrote it down. Anything narrower makes a collaborator unable to tick off the
 * work they were just assigned; anything wider makes `update_own` the same as
 * `update_any`.
 */
export function mayEditAction(viewer: ActionViewer, action: ActionOwnership): boolean {
  if (viewer.canUpdateAny) return true

  if (action.assigneeId === viewer.userId) return true
  if (action.createdBy === viewer.userId) return true

  return (action.collaboratorIds ?? []).includes(viewer.userId)
}
