'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { projectHealthSnapshots, projects, risks } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import { measureProject, readWeights } from './queries'
import { createRiskSchema, deleteRiskSchema, updateRiskSchema } from './schemas'
import { computeHealth } from './service'

export const createRisk = defineAction({
  input: createRiskSchema,
  permission: 'risk.create',
  handler: async (input, { actor, db, audit }) => {
    await requireProject(db, input.projectId)

    const id = uuidv7()
    await db.insert(risks).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      level: input.level,
      impact: input.impact ?? null,
      probability: input.probability ?? null,
      ownerUserId: input.ownerUserId ?? null,
      identifiedOn: input.identifiedOn ?? null,
      mitigationPlan: input.mitigationPlan ?? null,
      isClientVisible: input.isClientVisible,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    // The counter and the score move with the risk that caused them, in the
    // same transaction (ADR-013).
    await refreshProjectHealth(db, actor.organizationId, input.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'risk.created',
      entityType: 'risk',
      entityId: id,
      projectId: input.projectId,
      params: { name: input.title },
    })
    await audit({ action: 'risk.create', entityType: 'risk', entityId: id })

    return { id }
  },
})

export const updateRisk = defineAction({
  input: updateRiskSchema,
  permission: 'risk.update',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireRisk(db, input.id)
    const status = input.status ?? before.status

    await db
      .update(risks)
      .set({
        kind: input.kind ?? before.kind,
        title: input.title ?? before.title,
        description: pick(input.description, before.description),
        level: input.level ?? before.level,
        impact: pick(input.impact, before.impact),
        probability: pick(input.probability, before.probability),
        ownerUserId: pick(input.ownerUserId, before.ownerUserId),
        identifiedOn: pick(input.identifiedOn, before.identifiedOn),
        mitigationPlan: pick(input.mitigationPlan, before.mitigationPlan),
        isClientVisible: input.isClientVisible ?? before.isClientVisible,
        status,
        // Closing stamps the moment; re-opening clears it, or the history
        // would claim a risk was resolved while it is open again.
        resolvedAt: status === 'closed' ? (before.resolvedAt ?? new Date()) : null,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(risks.id, input.id))

    await refreshProjectHealth(db, actor.organizationId, before.projectId)

    await audit({
      action: 'risk.update',
      entityType: 'risk',
      entityId: input.id,
      before: { level: before.level, status: before.status },
      after: { level: input.level ?? before.level, status },
    })

    return { id: input.id }
  },
})

export const deleteRisk = defineAction({
  input: deleteRiskSchema,
  permission: 'risk.update',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireRisk(db, input.id)

    await db
      .update(risks)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(risks.id, input.id))

    await refreshProjectHealth(db, actor.organizationId, before.projectId)

    await audit({
      action: 'risk.delete',
      entityType: 'risk',
      entityId: input.id,
      before: { title: before.title },
    })

    return { id: input.id }
  },
})

/**
 * Recomputes on demand — from a screen, for one project.
 *
 * The scheduled job (`src/db/recompute-health.ts`) calls the SAME function
 * through the same measurement query. Two ways of computing the same score is
 * how a nightly job and a screen come to disagree about a number that is
 * supposed to mean something.
 */
export const recomputeProjectHealth = defineAction({
  input: createRiskSchema.pick({ projectId: true }),
  permission: 'project.read',
  handler: async (input, { actor, db }) => {
    await requireProject(db, input.projectId)
    const reading = await refreshProjectHealth(db, actor.organizationId, input.projectId)
    return reading
  },
})

/**
 * ============================================================================
 * The score, written.
 *
 * Called inside the caller's transaction, deliberately: a risk that commits
 * without moving the score would leave the project looking healthy until the
 * nightly job caught up — and "the dashboard was right yesterday" is not a
 * defence anyone accepts.
 *
 * Writes THREE things together: the snapshot (the history), and the two
 * denormalised columns on `projects` (what a list reads — ADR-013).
 * ============================================================================
 */
export async function refreshProjectHealth(
  db: TenantDb,
  organizationId: string,
  projectId: string,
) {
  const weights = await readWeights(db)
  const measured = await measureProject(db, projectId)
  const reading = computeHealth(measured, weights)

  await db.insert(projectHealthSnapshots).values({
    id: uuidv7(),
    organizationId,
    projectId,
    score: reading.score,
    status: reading.status,
    factors: reading.factors,
  })

  await db
    .update(projects)
    .set({
      healthScore: reading.score,
      healthStatus: reading.status,
      healthComputedAt: new Date(),
      openRisksCount: measured.openRisks,
    })
    .where(eq(projects.id, projectId))

  return reading
}

/** `undefined` means "not sent"; `null` means "cleared". They are not the same. */
function pick<T>(incoming: T | null | undefined, current: T | null): T | null {
  return incoming === undefined ? current : (incoming ?? null)
}

async function requireProject(db: TenantDb, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.project_not_found')
  return project
}

async function requireRisk(db: TenantDb, id: string) {
  const [row] = await db
    .select({
      id: risks.id,
      projectId: risks.projectId,
      kind: risks.kind,
      title: risks.title,
      description: risks.description,
      level: risks.level,
      impact: risks.impact,
      probability: risks.probability,
      ownerUserId: risks.ownerUserId,
      identifiedOn: risks.identifiedOn,
      mitigationPlan: risks.mitigationPlan,
      status: risks.status,
      resolvedAt: risks.resolvedAt,
      isClientVisible: risks.isClientVisible,
    })
    .from(risks)
    .where(and(eq(risks.id, id), isNull(risks.deletedAt)))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.risk_not_found')
  return row
}

/** Kept for the reconciliation job: which projects are worth recomputing. */
export async function staleProjectIds(db: TenantDb, limit = 500): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT id FROM projects
     WHERE deleted_at IS NULL AND status <> 'archived'
     ORDER BY health_computed_at ASC NULLS FIRST
     LIMIT ${limit}
  `)
  return (rows.rows as { id: string }[]).map((row) => row.id)
}
