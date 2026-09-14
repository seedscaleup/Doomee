import 'server-only'

import { uuidv7 } from 'uuidv7'
import { activityEvents } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'

/**
 * Records a business event on the feed.
 *
 * Called inside the caller's transaction, deliberately: an event that commits
 * without its cause, or a change that commits without its event, both make the
 * history a liar.
 *
 * It stores a VERB and parameters, never a sentence (ADR-011) — the same row is
 * read in French by one colleague and in English by another.
 */
export type ActivityEntityType =
  | 'client'
  | 'project'
  | 'action'
  | 'objective'
  | 'deliverable'
  | 'result'
  | 'insight'
  | 'report'
  | 'risk'
  | 'meeting'
  | 'milestone'

export type ActivityInput = {
  organizationId: string
  actorUserId: string | null
  /** 'client.created', 'action.completed', 'deliverable.approved'… */
  verb: string
  entityType: ActivityEntityType
  entityId: string
  clientId?: string | null
  projectId?: string | null
  params?: Record<string, string | number>
  /** Internal by default. A client sees an event only by a deliberate act. */
  visibility?: 'internal' | 'shared'
}

export async function recordActivity(db: TenantDb, input: ActivityInput): Promise<void> {
  await db.insert(activityEvents).values({
    id: uuidv7(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    verb: input.verb,
    entityType: input.entityType,
    entityId: input.entityId,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    params: input.params ?? {},
    visibility: input.visibility ?? 'internal',
  })
}
