'use server'

import { eq, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { portalDeliverables, portalDeliverableVersions, portalProjects } from '@/db/portal-schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { definePortalAction } from '@/server'
import { portalCommentSchema, portalDecisionSchema } from './schemas'

/**
 * ============================================================================
 * THE TWO THINGS A CLIENT DOES.
 *
 * Note the `::enum` casts below. PostgreSQL cannot infer an enum type for a
 * BOUND parameter — `INSERT INTO c (kind) VALUES ($1)` fails with "column is
 * of type entity_type but expression is of type text". A literal in the SQL
 * text is fine; a parameter is not. The same trap cost a debugging round in
 * LOT 7 (ADR-053) and is now written down where it bites.
 *
 * Both write to a BASE table, not to a view: it is the policy's WITH CHECK
 * clause that makes a write safe, and a view over a filtered table is not a
 * sane insert target.
 *
 * Neither passes the organisation, the client or the author from the input.
 * `app.organization_id`, `app.client_ids` and `app.user_id` are pinned by
 * `withPortal` inside the transaction, and the policies check all three. A
 * client cannot sign as somebody else, comment on a project that is not
 * theirs, or decide on a deliverable that was never sent to them — and none of
 * that depends on this file being written carefully.
 * ============================================================================
 */

/**
 * `✓ Approve` / `↻ Request changes`.
 *
 * The most consequential act in the portal, so it is one transaction: the
 * review is recorded AND the deliverable moves, or neither happens. A review
 * without the move would leave the agency waiting on a decision that was
 * already taken.
 */
export const decideOnDeliverable = definePortalAction({
  input: portalDecisionSchema,
  permission: 'deliverable.approve',
  handler: async (input, { actor, db, audit }) => {
    const version = await currentVersionOf(db, input.deliverableId)
    if (!version) throw new AppError('not_found', 'errors.not_found')

    const status = input.decision === 'approved' ? 'approved' : 'changes_requested'

    await db.execute(sql`
      INSERT INTO public.deliverable_reviews
        (id, organization_id, deliverable_id, version_id, scope, decision, comment,
         reviewer_user_id)
      VALUES (${uuidv7()}, ${actor.organizationId}, ${input.deliverableId}, ${version.id},
              'client', ${input.decision}::review_decision, ${input.comment ?? null},
              ${actor.userId})
    `)

    /**
     * Only the columns the portal is granted. `approved_by` and `approved_at`
     * are set on an approval and left alone otherwise — a change request is not
     * an approval, and stamping one would make the history read as if it were.
     */
    const result = await db.execute(sql`
      UPDATE public.deliverables
         SET status = ${status}::deliverable_status,
             approved_by = ${input.decision === 'approved' ? actor.userId : null},
             approved_at = ${input.decision === 'approved' ? sql`now()` : sql`NULL`},
             updated_at = now()
       WHERE id = ${input.deliverableId}
    `)

    // The UPDATE policy refuses a deliverable that is not awaiting THIS
    // client's decision. Zero rows means refused, not "nothing to do".
    if (result.rowCount === 0) throw new AppError('not_found', 'errors.not_found')

    await audit({
      action: `deliverable.client_${input.decision}`,
      entityType: 'deliverable',
      entityId: input.deliverableId,
      after: { status, version: version.version },
    })

    return { id: input.deliverableId, status }
  },
})

/**
 * A client's message, always shared.
 *
 * `visibility` is hard-coded here AND checked by the policy. A client has no
 * way to write an internal comment, and the second check is the one that
 * matters: this line could be edited, the policy could not.
 */
export const postPortalComment = definePortalAction({
  input: portalCommentSchema,
  permission: 'comment.create_shared',
  handler: async (input, { actor, db, audit }) => {
    const context = await contextOf(db, input.entityType, input.entityId)
    if (!context) throw new AppError('not_found', 'errors.not_found')

    const id = uuidv7()
    await db.execute(sql`
      INSERT INTO public.comments
        (id, organization_id, entity_type, entity_id, project_id, client_id,
         author_user_id, body, visibility)
      VALUES (${id}, ${actor.organizationId}, ${input.entityType}::entity_type,
              ${input.entityId}, ${context.projectId}, ${context.clientId},
              ${actor.userId}, ${input.body}, 'shared')
    `)

    await audit({
      action: 'comment.create_shared',
      entityType: input.entityType,
      entityId: input.entityId,
    })

    return { id }
  },
})

/** The version a decision is ABOUT — read through the views, like everything else. */
async function currentVersionOf(
  db: TenantDb,
  deliverableId: string,
): Promise<{ id: string; version: number } | null> {
  const rows = await db
    .select({ id: portalDeliverableVersions.id, version: portalDeliverableVersions.version })
    .from(portalDeliverables)
    .innerJoin(
      portalDeliverableVersions,
      eq(portalDeliverableVersions.id, portalDeliverables.currentVersionId),
    )
    .where(eq(portalDeliverables.id, deliverableId))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Which project and which client a comment belongs to.
 *
 * Derived from the entity rather than taken from the caller: a client_id that
 * arrives in the payload is a client_id a client can change. The policy would
 * refuse a wrong one anyway — this makes the right one impossible to get wrong.
 */
async function contextOf(
  db: TenantDb,
  entityType: 'project' | 'deliverable',
  entityId: string,
): Promise<{ projectId: string; clientId: string | null } | null> {
  if (entityType === 'project') {
    const rows = await db
      .select({ projectId: portalProjects.id, clientId: portalProjects.clientId })
      .from(portalProjects)
      .where(eq(portalProjects.id, entityId))
      .limit(1)
    return rows[0] ?? null
  }

  const rows = await db
    .select({ projectId: portalProjects.id, clientId: portalProjects.clientId })
    .from(portalDeliverables)
    .innerJoin(portalProjects, eq(portalProjects.id, portalDeliverables.projectId))
    .where(eq(portalDeliverables.id, entityId))
    .limit(1)

  return rows[0] ?? null
}
