import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()

/** 'YYYY-MM-DD'. A date column holds a calendar day, not an instant. */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()

export const actionStatusSchema = z.enum([
  'todo',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'cancelled',
])

export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])

/**
 * Quick create — the form that has to be fast (rule 10, *less typing*).
 *
 * A title and a project. Everything else has a smart default: the assignee is
 * whoever is creating unless they say otherwise, the status is `todo`, the
 * priority is `normal`. An action nobody has thought about yet is still worth
 * recording, and the form should not stand in the way of recording it.
 */
export const quickCreateActionSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(2).max(240),
  assigneeId: z.uuid().optional(),
  dueDate: calendarDay,
  priority: prioritySchema.default('normal'),
})
export type QuickCreateActionInput = z.infer<typeof quickCreateActionSchema>

export const createActionSchema = quickCreateActionSchema.extend({
  description: optionalText(4000),
  status: actionStatusSchema.default('todo'),
  actionTypeId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  startDate: calendarDay,
  estimatedMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  isClientVisible: z.boolean().default(false),
  blockedReason: optionalText(500),
})
export type CreateActionInput = z.infer<typeof createActionSchema>

export const updateActionSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(240).optional(),
  description: optionalText(4000),
  status: actionStatusSchema.optional(),
  priority: prioritySchema.optional(),
  actionTypeId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  channelId: z.uuid().nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
  startDate: calendarDay,
  dueDate: calendarDay,
  estimatedMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  spentMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  isClientVisible: z.boolean().optional(),
  blockedReason: optionalText(500),
})
export type UpdateActionInput = z.infer<typeof updateActionSchema>

/** The one-click move a kanban column or a detail header makes. */
export const changeActionStatusSchema = z.object({
  id: z.uuid(),
  status: actionStatusSchema,
  blockedReason: optionalText(500),
})

export const deleteActionSchema = z.object({ id: z.uuid() })

export const listActionsSchema = z.object({
  projectId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  status: actionStatusSchema.optional(),
  search: z.string().trim().max(160).optional(),
  /** Finished work is out of the way by default, not gone. */
  includeClosed: z.boolean().default(false),
  limit: z.number().int().min(1).max(500).default(200),
})
export type ListActionsInput = z.infer<typeof listActionsSchema>

export const setActionCollaboratorsSchema = z.object({
  actionId: z.uuid(),
  userIds: z.array(z.uuid()).max(20),
})

/**
 * A comment is internal unless someone deliberately says otherwise (rule 2).
 * The default lives in the schema AND in the column, because the two protect
 * against different mistakes: a forgotten field and a forgotten default.
 */
export const addCommentSchema = z.object({
  actionId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(['internal', 'shared']).default('internal'),
  mentionUserIds: z.array(z.uuid()).max(20).default([]),
})
export type AddCommentInput = z.infer<typeof addCommentSchema>

export const deleteCommentSchema = z.object({ id: z.uuid() })

export const attachToActionSchema = z.object({
  actionId: z.uuid(),
  file: z.instanceof(File),
})
