import { z } from 'zod'

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const deliverableStatusSchema = z.enum([
  'draft',
  'production',
  'internal_review',
  'client_review',
  'changes_requested',
  'approved',
  'published',
])

/**
 * A link a deliverable can point at.
 *
 * `http`/`https` only, and validated as a URL rather than as a string that
 * contains a dot: `javascript:` in an href is a cross-site script waiting for
 * someone to click it.
 */
const externalUrl = z
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), { error: 'errors.url_scheme' })

export const createDeliverableSchema = z.object({
  projectId: z.uuid(),
  actionId: z.uuid().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  deliverableTypeId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
  dueDate: calendarDay.optional(),
  externalUrl: externalUrl.optional(),
})
export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>

export const updateDeliverableSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(4000).nullish(),
  deliverableTypeId: z.uuid().nullish(),
  ownerUserId: z.uuid().nullish(),
  dueDate: calendarDay.nullish(),
  externalUrl: externalUrl.nullish(),
})

export const deleteDeliverableSchema = z.object({ id: z.uuid() })

/**
 * A new version.
 *
 * Neither field is required on its own, but the pair cannot both be empty —
 * that rule lives in the pure service (`describesSomething`), because "a
 * version must be something" is a product rule, not a parsing rule.
 */
export const addVersionSchema = z.object({
  deliverableId: z.uuid(),
  fileId: z.uuid().optional(),
  externalUrl: externalUrl.optional(),
  notes: z.string().trim().max(4000).optional(),
})

/** Moving the deliverable along its state machine. */
export const transitionSchema = z.object({
  id: z.uuid(),
  to: deliverableStatusSchema,
})

/**
 * A review decision.
 *
 * `comment` is required when changes are requested: "make it better" with no
 * further detail is the single most expensive message in agency work.
 */
export const reviewSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(['approved', 'changes_requested']),
    comment: z.string().trim().max(4000).optional(),
  })
  .refine((input) => input.decision !== 'changes_requested' || Boolean(input.comment), {
    path: ['comment'],
    error: 'errors.changes_reason_required',
  })

export const listDeliverablesSchema = z.object({
  projectId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: deliverableStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  includePublished: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(100),
})
export type ListDeliverablesInput = z.infer<typeof listDeliverablesSchema>
