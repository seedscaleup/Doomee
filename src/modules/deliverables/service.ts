/**
 * The deliverable's life, as pure rules.
 *
 * No database, no request context — the whole state machine can be exercised
 * without infrastructure, which is the point of CLAUDE.md §5.
 */

export type DeliverableStatusValue =
  | 'draft'
  | 'production'
  | 'internal_review'
  | 'client_review'
  | 'changes_requested'
  | 'approved'
  | 'published'

/**
 * Who may move the deliverable, expressed as a side of the wall rather than as
 * a role: the module does not re-implement the permission matrix, it only knows
 * that some doors open from the inside and some from the outside.
 */
export type Side = 'internal' | 'client'

type Transition = { to: DeliverableStatusValue; by: Side }

/**
 * Every legal move, as data.
 *
 * Read it as the cahier des charges wrote it:
 *   draft → production → internal_review → {production | client_review}
 *   client_review → {approved | changes_requested}
 *   changes_requested → production
 *   approved → published
 *
 * The two moves out of `client_review` belong to the CLIENT. That is the whole
 * asymmetry of the lot: an agency that can approve its own work on the client's
 * behalf has not built a validation step, it has built a checkbox.
 */
const TRANSITIONS: Record<DeliverableStatusValue, readonly Transition[]> = {
  draft: [{ to: 'production', by: 'internal' }],
  production: [
    { to: 'internal_review', by: 'internal' },
    { to: 'draft', by: 'internal' },
  ],
  internal_review: [
    // Sent back for more work, or judged good enough to show the client.
    { to: 'production', by: 'internal' },
    { to: 'client_review', by: 'internal' },
  ],
  client_review: [
    { to: 'approved', by: 'client' },
    { to: 'changes_requested', by: 'client' },
  ],
  changes_requested: [{ to: 'production', by: 'internal' }],
  approved: [{ to: 'published', by: 'internal' }],
  // The end of the line. A published deliverable that needs changing gets a new
  // version, which starts the cycle again — it does not un-publish itself.
  published: [],
}

export function allowedTransitions(
  from: DeliverableStatusValue,
  by: Side,
): readonly DeliverableStatusValue[] {
  return TRANSITIONS[from].filter((t) => t.by === by).map((t) => t.to)
}

export function canTransition(
  from: DeliverableStatusValue,
  to: DeliverableStatusValue,
  by: Side,
): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && t.by === by)
}

/**
 * Why a move was refused — so the screen can say something better than "no".
 *
 * `wrong_side` is deliberately distinct from `illegal`: "you cannot approve
 * your own deliverable" and "a draft cannot be published" are different
 * problems, and collapsing them would make the first one look like a bug
 * (ADR-041).
 */
export type TransitionRefusal =
  | { ok: true }
  | { ok: false; reason: 'terminal' }
  | { ok: false; reason: 'illegal' }
  | { ok: false; reason: 'wrong_side'; allowedSide: Side }

export function checkTransition(
  from: DeliverableStatusValue,
  to: DeliverableStatusValue,
  by: Side,
): TransitionRefusal {
  const moves = TRANSITIONS[from]
  if (moves.length === 0) return { ok: false, reason: 'terminal' }

  const match = moves.find((t) => t.to === to)
  if (!match) return { ok: false, reason: 'illegal' }
  if (match.by !== by) return { ok: false, reason: 'wrong_side', allowedSide: match.by }

  return { ok: true }
}

/** The states in which a client may see the deliverable at all. */
const CLIENT_VISIBLE_STATES = new Set<DeliverableStatusValue>([
  'client_review',
  'changes_requested',
  'approved',
  'published',
])

/**
 * Whether a client may see this deliverable.
 *
 * TWO conditions, both required: someone flagged it, AND it has reached a state
 * where showing it means something. A draft flagged client-visible by mistake
 * is still not shown — the flag is consent, the status is readiness, and
 * neither alone is enough (rule 2).
 *
 * This mirrors what the portal's RLS policy will enforce at LOT 9. The function
 * is the readable statement of it; the database is what makes it true.
 */
export function isVisibleToClient(deliverable: {
  status: DeliverableStatusValue
  isClientVisible: boolean
}): boolean {
  return deliverable.isClientVisible && CLIENT_VISIBLE_STATES.has(deliverable.status)
}

/** A deliverable still being worked on, for counting what is in flight. */
export function isInFlight(status: DeliverableStatusValue): boolean {
  return status !== 'published'
}

export function statusTone(
  status: DeliverableStatusValue,
): 'neutral' | 'progress' | 'success' | 'warning' {
  if (status === 'published' || status === 'approved') return 'success'
  if (status === 'changes_requested') return 'warning'
  if (status === 'production' || status === 'internal_review' || status === 'client_review') {
    return 'progress'
  }
  return 'neutral'
}

/**
 * The next version number.
 *
 * Counted from the versions that exist rather than from a column on the parent:
 * a counter that lives apart from the rows it counts is a counter that drifts.
 */
export function nextVersionNumber(existing: readonly { version: number }[]): number {
  return existing.reduce((highest, row) => Math.max(highest, row.version), 0) + 1
}

/**
 * A version must BE something.
 *
 * A row with neither a file nor a link is an empty promise: the client opens it
 * and finds nothing, and the review it triggers is a review of nothing.
 */
export function describesSomething(version: {
  fileId?: string | null
  externalUrl?: string | null
}): boolean {
  return Boolean(version.fileId) || Boolean(version.externalUrl?.trim())
}

/**
 * What a review decision does to the status.
 *
 * One place, so the screen, the mutation and the notification cannot disagree
 * about what "approved" means.
 */
export function statusAfterReview(
  scope: Side,
  decision: 'approved' | 'changes_requested',
): DeliverableStatusValue {
  if (scope === 'client') return decision === 'approved' ? 'approved' : 'changes_requested'
  // An internal approval does not ship anything to anyone: it only clears the
  // deliverable to be SENT. Sending is a separate, deliberate act.
  return decision === 'approved' ? 'internal_review' : 'production'
}
