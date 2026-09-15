import { z } from 'zod'

/**
 * A client's decision on a deliverable.
 *
 * `comment` is required when changes are asked for: "make it better" with no
 * further detail is the most expensive message in agency work, and it is the
 * client's side of the same rule the internal review already applies.
 */
export const portalDecisionSchema = z
  .object({
    deliverableId: z.uuid(),
    decision: z.enum(['approved', 'changes_requested']),
    comment: z.string().trim().max(4000).optional(),
  })
  .refine((input) => input.decision !== 'changes_requested' || Boolean(input.comment), {
    path: ['comment'],
    error: 'errors.changes_reason_required',
  })

/**
 * A client's comment.
 *
 * `entityType` is a closed set of TWO: a deliverable and a project. A client
 * does not comment on an internal action — see ADR-063, and the open decision
 * O9 it records.
 */
export const portalCommentSchema = z.object({
  entityType: z.enum(['project', 'deliverable']),
  entityId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
})
