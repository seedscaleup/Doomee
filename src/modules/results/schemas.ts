import { z } from 'zod'

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const resultNoteKindSchema = z.enum([
  'observation',
  'audience_feedback',
  'client_feedback',
  'difficulty',
  'positive',
  'negative',
  'learning',
  'opportunity',
])

/**
 * Recording a result.
 *
 * `values` is NOT validated here: it is validated at runtime against the
 * template's own fields (ADR-008), which this schema cannot know. What it does
 * enforce is the envelope — which project, which template, which date the
 * result is ABOUT.
 */
export const recordResultSchema = z.object({
  projectId: z.uuid(),
  actionId: z.uuid().optional(),
  objectiveId: z.uuid().optional(),
  templateId: z.uuid(),
  title: z.string().trim().max(240).optional(),
  /** The date the result is about, not the date it was typed. */
  recordedFor: calendarDay,
  periodStart: calendarDay.optional(),
  periodEnd: calendarDay.optional(),
  /** "What did we learn?" */
  analysis: z.string().trim().max(4000).optional(),
  /** "What should we do next?" */
  recommendation: z.string().trim().max(4000).optional(),
  isClientVisible: z.boolean().default(false),
  /** Raw form answers, keyed by the template's field keys. */
  values: z.record(z.string(), z.string()).default({}),
  notes: z
    .array(z.object({ kind: resultNoteKindSchema, body: z.string().trim().min(1).max(4000) }))
    .max(20)
    .default([]),
})
export type RecordResultInput = z.infer<typeof recordResultSchema>

export const updateResultSchema = recordResultSchema
  .partial()
  .extend({ id: z.uuid(), templateId: z.uuid() })

export const deleteResultSchema = z.object({ id: z.uuid() })

export const listResultsSchema = z.object({
  projectId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  actionId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  actionTypeId: z.uuid().optional(),
  recordedById: z.uuid().optional(),
  from: calendarDay.optional(),
  to: calendarDay.optional(),
  limit: z.number().int().min(1).max(500).default(100),
})
export type ListResultsInput = z.infer<typeof listResultsSchema>
