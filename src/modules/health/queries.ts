import 'server-only'

import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { isoInstant, isoInstantOrNull } from '@/db/columns'
import { clients, projectHealthSnapshots, projects, risks, users } from '@/db/schema'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listRisksSchema } from './schemas'
import {
  computeHealth,
  type HealthInput,
  type HealthReading,
  type HealthWeights,
  normaliseWeights,
} from './service'
import type { AlertRow, PersonOption, ProjectHealthRow, ProjectOption, RiskRow } from './types'

/**
 * The collaborator scope, once more (ADR-038).
 *
 * Takes the column that HOLDS the project id — `risks.project_id` in one place
 * and `projects.id` in another — so the rule is written once instead of being
 * copied with a different join each time.
 */
function withinVisibleProjects(actor: Actor, column: AnyPgColumn): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${column} AND pm.user_id = ${actor.userId}
  )`
}

export const listRisks = defineQuery({
  input: listRisksSchema,
  permission: 'risk.read',
  handler: async (input, { actor, db }): Promise<RiskRow[]> => {
    const filters: (SQL | undefined)[] = [
      isNull(risks.deletedAt),
      withinVisibleProjects(actor, risks.projectId),
    ]

    if (input.projectId) filters.push(eq(risks.projectId, input.projectId))
    if (input.level) filters.push(eq(risks.level, input.level))
    if (input.status) filters.push(eq(risks.status, input.status))
    if (!input.includeClosed && !input.status) {
      filters.push(sql`${risks.status} <> 'closed'`)
    }

    return (
      db
        .select({
          id: risks.id,
          projectId: risks.projectId,
          projectName: projects.name,
          clientName: clients.name,
          kind: risks.kind,
          title: risks.title,
          description: risks.description,
          level: risks.level,
          impact: risks.impact,
          probability: risks.probability,
          ownerUserId: risks.ownerUserId,
          ownerName: users.name,
          identifiedOn: risks.identifiedOn,
          mitigationPlan: risks.mitigationPlan,
          status: risks.status,
          isClientVisible: risks.isClientVisible,
        })
        .from(risks)
        .innerJoin(projects, eq(projects.id, risks.projectId))
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .leftJoin(users, eq(users.id, risks.ownerUserId))
        .where(and(...filters))
        // Critical first: a risk register sorted by date is a list nobody reads
        // to the bottom.
        .orderBy(
          sql`CASE ${risks.level} WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
          desc(risks.createdAt),
        )
        .limit(input.limit)
    )
  },
})

/**
 * ============================================================================
 * THE HEALTH SCORE, computed.
 *
 * Every input in ONE query, then the PURE service does the arithmetic. The
 * split matters: the SQL knows how to count, the service knows what the counts
 * mean, and the second half is testable without a database.
 * ============================================================================
 */
export const readProjectHealth = defineQuery({
  input: z.object({ projectId: z.uuid() }),
  permission: 'project.read',
  handler: async (input, { db }): Promise<HealthReading> => {
    const weights = await readWeights(db)
    const measured = await measureProject(db, input.projectId)
    return computeHealth(measured, weights)
  },
})

/** The stored score and its factors, for a list. Never recomputed per row (ADR-013). */
export const listProjectHealth = defineQuery({
  permission: 'project.read',
  handler: async (_input: undefined, { actor, db }): Promise<ProjectHealthRow[]> => {
    const rows = await db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        score: projects.healthScore,
        status: projects.healthStatus,
        computedAt: isoInstantOrNull(projects.healthComputedAt),
        factors: sql<ProjectHealthRow['factors']>`coalesce((
          SELECT s.factors FROM project_health_snapshots s
           WHERE s.project_id = ${projects.id}
           ORDER BY s.computed_at DESC LIMIT 1
        ), '[]'::jsonb)`,
      })
      .from(projects)
      .where(
        and(
          isNull(projects.deletedAt),
          sql`${projects.status} <> 'archived'`,
          withinVisibleProjects(actor, projects.id),
        ),
      )
      .orderBy(sql`${projects.healthScore} ASC NULLS LAST`, asc(projects.name))
      .limit(200)

    return rows
  },
})

/** The history — what turns "at risk" into "sliding for three weeks". */
export const listHealthHistory = defineQuery({
  input: z.object({ projectId: z.uuid(), limit: z.number().int().min(1).max(90).default(30) }),
  permission: 'project.read',
  handler: async (input, { db }) => {
    return db
      .select({
        id: projectHealthSnapshots.id,
        score: projectHealthSnapshots.score,
        status: projectHealthSnapshots.status,
        computedAt: isoInstant(projectHealthSnapshots.computedAt),
      })
      .from(projectHealthSnapshots)
      .where(eq(projectHealthSnapshots.projectId, input.projectId))
      .orderBy(desc(projectHealthSnapshots.computedAt))
      .limit(input.limit)
  },
})

/**
 * ============================================================================
 * THE ALERT CENTRE.
 *
 * Four questions, one query each, all scoped the same way. Everything here is
 * something a person has to act on today — a feed of things that merely
 * happened is a feed nobody reads twice.
 *
 * Sequential, not Promise.all: one transaction runs one query at a time
 * (ADR-044).
 * ============================================================================
 */
export const listAlerts = defineQuery({
  permission: 'action.read',
  handler: async (_input: undefined, { actor, db }): Promise<AlertRow[]> => {
    const scope = can(actor, 'project.read_all')
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = p.id AND pm.user_id = ${actor.userId}
        )`

    const overdue = await db.execute(sql`
      SELECT a.id, a.title, p.id AS project_id, p.name AS project_name,
             (current_date - a.due_date)::int AS days
        FROM actions a
        JOIN projects p ON p.id = a.project_id
       WHERE ${scope}
         AND a.deleted_at IS NULL AND p.deleted_at IS NULL
         AND a.status NOT IN ('done', 'cancelled')
         AND a.due_date < current_date
       ORDER BY a.due_date ASC
       LIMIT 50
    `)

    const pending = await db.execute(sql`
      SELECT d.id, d.title, p.id AS project_id, p.name AS project_name,
             (current_date - d.sent_to_client_at::date)::int AS days
        FROM deliverables d
        JOIN projects p ON p.id = d.project_id
       WHERE ${scope}
         AND d.deleted_at IS NULL AND p.deleted_at IS NULL
         AND d.status = 'client_review'
       ORDER BY d.sent_to_client_at ASC NULLS LAST
       LIMIT 50
    `)

    const atRisk = await db.execute(sql`
      SELECT p.id, p.name AS title, p.id AS project_id, p.name AS project_name,
             p.health_score AS score
        FROM projects p
       WHERE ${scope}
         AND p.deleted_at IS NULL AND p.status <> 'archived'
         AND p.health_status IN ('at_risk', 'blocked')
       ORDER BY p.health_score ASC NULLS LAST
       LIMIT 50
    `)

    const behind = await db.execute(sql`
      SELECT o.id, o.title, p.id AS project_id, p.name AS project_name,
             coalesce(o.achievement_percent, 0) AS percent
        FROM objectives o
        JOIN projects p ON p.id = o.project_id
       WHERE ${scope}
         AND o.deleted_at IS NULL AND p.deleted_at IS NULL
         AND o.status NOT IN ('achieved', 'cancelled')
         AND o.period_end IS NOT NULL AND o.period_end < current_date
         AND coalesce(o.achievement_percent, 0) < 100
       ORDER BY o.period_end ASC
       LIMIT 50
    `)

    return [
      ...rowsToAlerts(overdue.rows, 'overdue_action', (row) => ({
        params: { days: Number(row.days ?? 0) },
        href: `/app/actions/${String(row.id)}`,
      })),
      ...rowsToAlerts(pending.rows, 'pending_validation', (row) => ({
        params: { days: Number(row.days ?? 0) },
        href: `/app/deliverables/${String(row.id)}`,
      })),
      ...rowsToAlerts(atRisk.rows, 'project_at_risk', (row) => ({
        params: { score: Number(row.score ?? 0) },
        href: `/app/projects/${String(row.id)}`,
      })),
      ...rowsToAlerts(behind.rows, 'objective_behind', (row) => ({
        params: { percent: Number(row.percent ?? 0) },
        href: `/app/projects/${String(row.project_id)}`,
      })),
    ]
  },
})

export const listRiskScopes = defineQuery({
  permission: 'risk.create',
  handler: async (
    _input: undefined,
    { actor, db },
  ): Promise<{ projects: ProjectOption[]; people: PersonOption[] }> => {
    const scope = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${projects.id} AND pm.user_id = ${actor.userId}
        )`

    // Sequential: one transaction, one query at a time (ADR-044).
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(isNull(projects.deletedAt), sql`${projects.status} <> 'archived'`, scope))
      .orderBy(asc(projects.name))
      .limit(500)

    const peopleRows = await db.execute(sql`
      SELECT u.id AS user_id, u.name
        FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.status = 'active' AND m.role <> 'client'
       ORDER BY u.name
       LIMIT 500
    `)

    return {
      projects: projectRows,
      people: (peopleRows.rows as Record<string, unknown>[]).map((row) => ({
        userId: String(row.user_id),
        name: String(row.name),
      })),
    }
  },
})

/**
 * ============================================================================
 * The measurements, and the weights. Exported for the recompute job, which
 * must use exactly these — two ways of counting the same thing is how a
 * nightly job and a screen come to disagree.
 * ============================================================================
 */
export async function readWeights(db: {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>
}): Promise<HealthWeights> {
  const rows = await db.execute(sql`
    SELECT settings -> 'health' -> 'weights' AS weights FROM organizations LIMIT 1
  `)
  const value = (rows.rows[0] as { weights?: Partial<HealthWeights> } | undefined)?.weights
  return normaliseWeights(value)
}

export async function measureProject(
  db: { execute: (query: SQL) => Promise<{ rows: unknown[] }> },
  projectId: string,
): Promise<HealthInput> {
  const rows = await db.execute(sql`
    SELECT
      p.progress_percent,
      /* How much of the calendar has elapsed. NULL when the project has no
         dates — a project cannot be late against a schedule it does not have. */
      CASE
        WHEN p.start_date IS NULL OR p.end_date IS NULL OR p.end_date <= p.start_date THEN NULL
        ELSE greatest(0, least(100,
          round(100.0 * (current_date - p.start_date) / (p.end_date - p.start_date))))::int
      END AS schedule_elapsed_percent,
      (SELECT count(*)::int FROM actions a
        WHERE a.project_id = p.id AND a.deleted_at IS NULL) AS actions_total,
      (SELECT count(*)::int FROM actions a
        WHERE a.project_id = p.id AND a.deleted_at IS NULL
          AND a.status NOT IN ('done', 'cancelled')
          AND a.due_date < current_date) AS actions_overdue,
      (SELECT count(*)::int FROM actions a
        WHERE a.project_id = p.id AND a.deleted_at IS NULL
          AND a.status = 'blocked') AS actions_blocked,
      (SELECT count(*)::int FROM deliverables d
        WHERE d.project_id = p.id AND d.deleted_at IS NULL
          AND d.status = 'client_review') AS deliverables_pending_client,
      coalesce((SELECT max((current_date - d.sent_to_client_at::date))::int FROM deliverables d
        WHERE d.project_id = p.id AND d.deleted_at IS NULL
          AND d.status = 'client_review'), 0) AS oldest_pending_client_days,
      (SELECT count(*)::int FROM risks r
        WHERE r.project_id = p.id AND r.deleted_at IS NULL
          AND r.status <> 'closed') AS open_risks,
      (SELECT count(*)::int FROM risks r
        WHERE r.project_id = p.id AND r.deleted_at IS NULL
          AND r.status <> 'closed' AND r.level = 'critical') AS critical_risks,
      coalesce((SELECT max(c)::int FROM (
        SELECT count(*) AS c FROM actions a
         WHERE a.project_id = p.id AND a.deleted_at IS NULL
           AND a.status NOT IN ('done', 'cancelled') AND a.assignee_id IS NOT NULL
         GROUP BY a.assignee_id
      ) AS per_person), 0) AS busiest_assignee_open_actions,
      (SELECT count(*)::int FROM actions a
        WHERE a.project_id = p.id AND a.deleted_at IS NULL AND a.status = 'done'
          AND NOT EXISTS (
            SELECT 1 FROM results r WHERE r.action_id = a.id AND r.deleted_at IS NULL
          )) AS done_actions_without_result,
      (SELECT count(*)::int FROM milestones m
        WHERE m.project_id = p.id AND m.deleted_at IS NULL
          AND m.status <> 'reached' AND m.due_date < current_date) AS milestones_overdue,
      (SELECT count(*)::int FROM milestones m
        WHERE m.project_id = p.id AND m.deleted_at IS NULL) AS milestones_total
    FROM projects p
   WHERE p.id = ${projectId}
  `)

  const row = (rows.rows[0] ?? {}) as Record<string, unknown>
  const int = (key: string) => Number(row[key] ?? 0)

  return {
    progressPercent: int('progress_percent'),
    scheduleElapsedPercent:
      row.schedule_elapsed_percent === null || row.schedule_elapsed_percent === undefined
        ? null
        : Number(row.schedule_elapsed_percent),
    actionsTotal: int('actions_total'),
    actionsOverdue: int('actions_overdue'),
    actionsBlocked: int('actions_blocked'),
    deliverablesPendingClient: int('deliverables_pending_client'),
    oldestPendingClientDays: int('oldest_pending_client_days'),
    openRisks: int('open_risks'),
    criticalRisks: int('critical_risks'),
    busiestAssigneeOpenActions: int('busiest_assignee_open_actions'),
    doneActionsWithoutResult: int('done_actions_without_result'),
    milestonesOverdue: int('milestones_overdue'),
    milestonesTotal: int('milestones_total'),
  }
}

function rowsToAlerts(
  rows: unknown[],
  kind: AlertRow['kind'],
  extra: (row: Record<string, unknown>) => { params: Record<string, number>; href: string },
): AlertRow[] {
  return (rows as Record<string, unknown>[]).map((row) => ({
    kind,
    id: String(row.id),
    title: String(row.title),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    ...extra(row),
  }))
}
