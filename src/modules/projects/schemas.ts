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

export const projectStatusSchema = z.enum([
  'to_start',
  'in_progress',
  'in_review',
  'paused',
  'blocked',
  'done',
  'archived',
])

export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])
export const projectMemberRoleSchema = z.enum(['lead', 'member', 'reviewer'])

/**
 * Money carries its currency or it is not money (ADR-024). Zod refuses an
 * amount without one so the pair can never be half-filled in the database.
 */
const budget = z
  .object({
    budgetAmount: z
      .string()
      .regex(/^\d{1,16}(\.\d{1,2})?$/)
      .optional(),
    budgetCurrency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .refine((value) => Boolean(value.budgetAmount) === Boolean(value.budgetCurrency), {
    message: 'an amount needs its currency, and a currency needs its amount',
    path: ['budgetCurrency'],
  })

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    code: optionalText(40),
    clientId: z.uuid().optional(),
    description: optionalText(2000),
    status: projectStatusSchema.default('to_start'),
    priority: prioritySchema.default('normal'),
    color: optionalText(40),
    startDate: calendarDay,
    endDate: calendarDay,
    timezone: z.string().trim().min(1).max(64).optional(),
    ownerUserId: z.uuid().optional(),
    isClientVisible: z.boolean().default(true),
  })
  .and(budget)
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: 'a project cannot end before it starts',
    path: ['endDate'],
  })

export type CreateProjectInput = z.infer<typeof createProjectSchema>

/**
 * Update repeats the shape rather than `.partial()`ing it: `createProjectSchema`
 * is an intersection with a refinement, and partialising that silently drops
 * the "amount needs its currency" rule it exists to enforce.
 */
export const updateProjectSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(2).max(160).optional(),
    code: optionalText(40),
    clientId: z.uuid().nullable().optional(),
    description: optionalText(2000),
    status: projectStatusSchema.optional(),
    priority: prioritySchema.optional(),
    color: optionalText(40),
    startDate: calendarDay,
    endDate: calendarDay,
    ownerUserId: z.uuid().nullable().optional(),
    isClientVisible: z.boolean().optional(),
  })
  .and(budget)

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const archiveProjectSchema = z.object({ id: z.uuid() })

export const listProjectsSchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: projectStatusSchema.optional(),
  clientId: z.uuid().optional(),
  /** Archived projects are out of the way by default, not gone. */
  includeArchived: z.boolean().default(false),
})
export type ListProjectsInput = z.infer<typeof listProjectsSchema>

export const addProjectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: projectMemberRoleSchema.default('member'),
})

export const removeProjectMemberSchema = z.object({ projectId: z.uuid(), userId: z.uuid() })

export const createMilestoneSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(2).max(200),
  description: optionalText(2000),
  dueDate: calendarDay,
  isClientVisible: z.boolean().default(false),
})

export const reachMilestoneSchema = z.object({ id: z.uuid(), reached: z.boolean() })
export const deleteMilestoneSchema = z.object({ id: z.uuid() })
