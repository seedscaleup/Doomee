import { z } from 'zod'

/** Roles an existing member may be invited as. `owner` is transferred, not invited. */
export const invitableRoleSchema = z.enum(['direction', 'manager', 'collaborator'])

export const inviteMemberSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: invitableRoleSchema,
  jobTitle: z.string().trim().max(120).optional(),
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(200),
})

export const changeRoleSchema = z.object({
  userId: z.uuid(),
  role: invitableRoleSchema,
})

export const deactivateMemberSchema = z.object({ userId: z.uuid() })
