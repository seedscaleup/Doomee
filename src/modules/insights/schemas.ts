import { z } from 'zod'

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * An insight.
 *
 * Only the title is required. The four questions get answered over a meeting,
 * sometimes over two — a form that demanded all of them would get "n/a" four
 * times (*Less typing*, rule 10).
 */
/**
 * The fields, as a PLAIN object.
 *
 * Kept separate from the refinement below because Zod refuses `.partial()` on
 * a schema that carries one — and it refuses at RUNTIME, so `.partial()` of a
 * refined schema typechecks happily and then throws the first time the module
 * is evaluated. It cost a build to find out; this shape makes it impossible.
 */
const insightFields = z.object({
  projectId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  title: z.string().trim().min(1).max(240),
  whatWorked: z.string().trim().max(4000).optional(),
  whatDidnt: z.string().trim().max(4000).optional(),
  whatWeLearned: z.string().trim().max(4000).optional(),
  recommendation: z.string().trim().max(4000).optional(),
  periodStart: calendarDay.optional(),
  periodEnd: calendarDay.optional(),
  isClientVisible: z.boolean().default(false),
  /** The results this insight is built on — what makes it a finding. */
  resultIds: z.array(z.uuid()).max(50).default([]),
})

/** A period that ends before it starts is a typo, and it is worth saying so. */
const periodIsOrdered = (input: { periodStart?: string; periodEnd?: string }) =>
  !input.periodStart || !input.periodEnd || input.periodStart <= input.periodEnd

/** Not `as const`: Zod wants a mutable `path`, and a readonly one is refused. */
const PERIOD_MESSAGE = { path: ['periodEnd'], error: 'errors.period_inverted' }

export const createInsightSchema = insightFields.refine(periodIsOrdered, PERIOD_MESSAGE)

export const updateInsightSchema = insightFields
  .partial()
  .extend({ id: z.uuid() })
  .refine(periodIsOrdered, PERIOD_MESSAGE)

export const deleteInsightSchema = z.object({ id: z.uuid() })

/**
 * `Create next action` — the last edge of the loop.
 *
 * The title arrives pre-filled from the recommendation, and stays editable:
 * the recommendation IS the action most of the time, but not always.
 */
export const createNextActionSchema = z.object({
  insightId: z.uuid(),
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  assigneeId: z.uuid().optional(),
  dueDate: calendarDay.optional(),
})

export const listInsightsSchema = z.object({
  projectId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  from: calendarDay.optional(),
  to: calendarDay.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(100),
})
export type ListInsightsInput = z.infer<typeof listInsightsSchema>
