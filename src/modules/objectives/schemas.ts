import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()

const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()

export const objectiveStatusSchema = z.enum(['draft', 'active', 'achieved', 'missed', 'cancelled'])

/**
 * A target and its currency travel together or not at all (ADR-024).
 *
 * Refused here rather than fixed up, because the half-filled pair is exactly
 * what makes a gap incomputable later — and by then nobody remembers which half
 * was guessed.
 */
const target = z
  .object({
    targetValue: z
      .string()
      .regex(/^-?\d{1,16}(\.\d{1,4})?$/)
      .optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .refine((value) => !value.currency || Boolean(value.targetValue), {
    message: 'a currency needs an amount to go with',
    path: ['currency'],
  })

export const createObjectiveSchema = z
  .object({
    projectId: z.uuid(),
    title: z.string().trim().min(2).max(240),
    description: optionalText(2000),
    objectiveTypeId: z.uuid().optional(),
    metricId: z.uuid().optional(),
    unit: optionalText(40),
    periodStart: calendarDay,
    periodEnd: calendarDay,
    status: objectiveStatusSchema.default('draft'),
    ownerUserId: z.uuid().optional(),
    isClientVisible: z.boolean().default(true),
  })
  .and(target)
  .refine(
    (value) => !value.periodStart || !value.periodEnd || value.periodStart <= value.periodEnd,
    { message: 'a period cannot end before it starts', path: ['periodEnd'] },
  )

export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>

export const updateObjectiveSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(2).max(240).optional(),
    description: optionalText(2000),
    objectiveTypeId: z.uuid().nullable().optional(),
    metricId: z.uuid().nullable().optional(),
    unit: optionalText(40),
    periodStart: calendarDay,
    periodEnd: calendarDay,
    status: objectiveStatusSchema.optional(),
    ownerUserId: z.uuid().nullable().optional(),
    isClientVisible: z.boolean().optional(),
  })
  .and(target)

export type UpdateObjectiveInput = z.infer<typeof updateObjectiveSchema>

export const deleteObjectiveSchema = z.object({ id: z.uuid() })

export const listObjectivesSchema = z.object({
  projectId: z.uuid().optional(),
  status: objectiveStatusSchema.optional(),
  includeClosed: z.boolean().default(true),
})
export type ListObjectivesInput = z.infer<typeof listObjectivesSchema>
