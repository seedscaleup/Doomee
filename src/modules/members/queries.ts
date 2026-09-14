import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { invitations, users } from '@/db/schema'
import { defineQuery } from '@/server'
import { invitationState } from './service'

export const listInvitations = defineQuery({
  permission: 'member.read',
  handler: async (_input: undefined, { db }) => {
    const rows = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        invitedBy: users.name,
      })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .orderBy(desc(invitations.createdAt))
      .limit(100)

    const now = new Date()
    return rows.map((row) => ({ ...row, state: invitationState(row, now) }))
  },
})
