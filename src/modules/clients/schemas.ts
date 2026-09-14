import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()

export const clientStatusSchema = z.enum(['prospect', 'active', 'paused', 'archived'])

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(160),
  industryId: z.uuid().optional(),
  description: optionalText(2000),
  website: optionalText(300),
  email: z.union([z.email(), z.literal('')]).optional(),
  phone: optionalText(40),
  address: optionalText(300),
  status: clientStatusSchema.default('active'),
  ownerUserId: z.uuid().optional(),
  /** Internal only. Never reaches the portal (ADR-026). */
  accountTeamNote: optionalText(2000),
})

export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSchema = createClientSchema.partial().extend({ id: z.uuid() })
export type UpdateClientInput = z.infer<typeof updateClientSchema>

export const archiveClientSchema = z.object({ id: z.uuid() })

export const listClientsSchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: clientStatusSchema.optional(),
})
export type ListClientsInput = z.infer<typeof listClientsSchema>

export const inviteClientContactSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  email: z.email().trim().toLowerCase(),
  jobTitle: optionalText(120),
  isPrimary: z.boolean().default(false),
})
export type InviteClientContactInput = z.infer<typeof inviteClientContactSchema>

export const inviteContactToPortalSchema = z.object({ contactId: z.uuid() })
export type InviteContactToPortalInput = z.infer<typeof inviteContactToPortalSchema>
