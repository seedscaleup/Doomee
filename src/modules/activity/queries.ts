import 'server-only'

import { and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { activityEvents, users } from '@/db/schema'
import { defineQuery } from '@/server'

export type ActivityRow = {
  id: string
  verb: string
  entityType: string
  entityId: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: Date
}

const listSchema = z.object({
  clientId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  /** Cursor pagination: never OFFSET on an append-only table (ADR-022). */
  before: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).default(30),
})

export const listActivity = defineQuery({
  input: listSchema,
  permission: 'activity.read',
  handler: async (input, { db }) => {
    const filters = [
      input.clientId ? eq(activityEvents.clientId, input.clientId) : undefined,
      input.projectId ? eq(activityEvents.projectId, input.projectId) : undefined,
      input.before ? lt(activityEvents.createdAt, input.before) : undefined,
    ].filter((clause) => clause !== undefined)

    const rows = await db
      .select({
        id: activityEvents.id,
        verb: activityEvents.verb,
        entityType: activityEvents.entityType,
        entityId: activityEvents.entityId,
        actorName: users.name,
        params: activityEvents.params,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .leftJoin(users, eq(users.id, activityEvents.actorUserId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
      .limit(input.limit)

    return rows as ActivityRow[]
  },
})
