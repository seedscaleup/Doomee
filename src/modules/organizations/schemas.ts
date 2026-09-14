import { z } from 'zod'

/**
 * Input contracts. Validation happens at the boundary, once, in defineAction —
 * so a handler never has to wonder whether its input is trustworthy.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const localeSchema = z.enum(['fr', 'en'])

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(SLUG, 'errors.invalid_slug'),
  defaultLocale: localeSchema.default('fr'),
  timezone: z.string().min(1).default('UTC'),
  defaultCurrency: z.string().length(3).toUpperCase().default('XOF'),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

export const updateOrganizationSchema = createOrganizationSchema
  .omit({ slug: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'errors.nothing_to_update')

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
