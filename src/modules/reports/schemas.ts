import { z } from 'zod'

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const reportTypeSchema = z.enum([
  'weekly_internal',
  'monthly',
  'project',
  'client',
  'campaign_review',
  'period_review',
])

export const sectionKeySchema = z.enum([
  'executive_summary',
  'objectives',
  'actions',
  'deliverables',
  'results',
  'objectives_comparison',
  'analysis',
  'insights',
  'attention_points',
  'recommendations',
  'next_steps',
])

/**
 * The creation wizard: type → scope → period → LANGUAGE → generate.
 *
 * `locale` is asked explicitly and defaults to the author's `report_locale`,
 * never to their interface language (ADR-011). A French team writing for an
 * English client should not have to switch their own UI to do it.
 */
export const createReportSchema = z
  .object({
    type: reportTypeSchema,
    title: z.string().trim().min(1).max(240),
    projectId: z.uuid().optional(),
    clientId: z.uuid().optional(),
    periodStart: calendarDay,
    periodEnd: calendarDay,
    locale: z.enum(['fr', 'en']),
  })
  .refine((input) => input.periodStart <= input.periodEnd, {
    path: ['periodEnd'],
    error: 'errors.period_inverted',
  })

export const updateReportSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  locale: z.enum(['fr', 'en']).optional(),
})

/** Editing one section: its prose, its order, whether it is in, whether the client sees it. */
export const updateSectionSchema = z.object({
  id: z.uuid(),
  body: z.string().trim().max(20_000).nullish(),
  titleOverride: z.string().trim().max(240).nullish(),
  sortOrder: z.number().int().min(0).max(100).optional(),
  isIncluded: z.boolean().optional(),
  isClientVisible: z.boolean().optional(),
})

export const publishReportSchema = z.object({ id: z.uuid() })
export const archiveReportSchema = z.object({ id: z.uuid() })
export const deleteReportSchema = z.object({ id: z.uuid() })
export const regenerateSectionSchema = z.object({ id: z.uuid() })
export const exportReportSchema = z.object({ id: z.uuid() })

/**
 * A share link.
 *
 * `expiresInDays` is bounded by the service, not here: "at most 90 days" is a
 * product rule, and the pure service is where product rules are testable.
 */
export const createShareSchema = z.object({
  reportId: z.uuid(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  password: z.string().min(6).max(200).optional(),
  recipientEmail: z.email().max(320).optional(),
})

export const revokeShareSchema = z.object({ id: z.uuid() })

export const listReportsSchema = z.object({
  projectId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: z.enum(['draft', 'in_review', 'published', 'archived']).optional(),
  limit: z.number().int().min(1).max(200).default(100),
})
