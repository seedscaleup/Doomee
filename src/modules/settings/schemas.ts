import { z } from 'zod'

const localeSchema = z.enum(['fr', 'en'])

/**
 * Three languages, three independent settings (ADR-011): the interface, the
 * notifications a person receives, and the reports they produce.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  locale: localeSchema,
  reportLocale: localeSchema,
  timezone: z.string().min(1).max(64),
  dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
