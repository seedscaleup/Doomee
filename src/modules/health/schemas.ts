import { z } from 'zod'

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const riskLevelSchema = z.enum(['low', 'medium', 'critical'])
export const riskStatusSchema = z.enum(['open', 'mitigated', 'closed'])
export const riskKindSchema = z.enum(['risk', 'issue'])

/**
 * A risk.
 *
 * Title, project and level are required — a risk without a level cannot be
 * sorted, and an unsorted risk register is a list nobody opens. Everything
 * else is filled in as it becomes known.
 */
export const createRiskSchema = z.object({
  projectId: z.uuid(),
  kind: riskKindSchema.default('risk'),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  level: riskLevelSchema.default('medium'),
  impact: z.string().trim().max(2000).optional(),
  probability: z.string().trim().max(2000).optional(),
  ownerUserId: z.uuid().optional(),
  identifiedOn: calendarDay.optional(),
  mitigationPlan: z.string().trim().max(4000).optional(),
  isClientVisible: z.boolean().default(false),
})

export const updateRiskSchema = createRiskSchema
  .partial()
  .extend({ id: z.uuid(), status: riskStatusSchema.optional() })

export const deleteRiskSchema = z.object({ id: z.uuid() })

export const listRisksSchema = z.object({
  projectId: z.uuid().optional(),
  level: riskLevelSchema.optional(),
  status: riskStatusSchema.optional(),
  includeClosed: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(100),
})
