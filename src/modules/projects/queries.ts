import 'server-only'

import { and, asc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clients, memberships, milestones, projectMembers, projects, users } from '@/db/schema'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listProjectsSchema } from './schemas'
import type { ClientOption, ColleagueOption, MilestoneRow, ProjectMemberRow } from './types'

/**
 * ============================================================================
 * THE COLLABORATOR SCOPE — the second security barrier, in one place.
 *
 * `project.read` says a collaborator may read projects. It does not say WHICH,
 * and that question has one answer: the ones they are a member of
 * (docs/database.md — `project_members` is "la table qui définit la portée d'un
 * collaborateur"). Everyone above them — owner, direction, manager — holds
 * `project.read_all` and sees the whole organisation.
 *
 * Every read of a project passes through this, so there is one place to get it
 * right and one place to check. Row level security is still underneath: this
 * decides which rows WITHIN the tenant, never which tenant.
 * ============================================================================
 */
function scopedToActor(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${projects.id}
       AND pm.user_id = ${actor.userId}
  )`
}

export const listProjects = defineQuery({
  input: listProjectsSchema,
  permission: 'project.read',
  handler: async (input, { actor, db }) => {
    const filters: (SQL | undefined)[] = [isNull(projects.deletedAt), scopedToActor(actor)]

    if (input.status) filters.push(eq(projects.status, input.status))
    if (input.clientId) filters.push(eq(projects.clientId, input.clientId))
    if (!input.includeArchived) filters.push(sql`${projects.status} <> 'archived'`)

    if (input.search) {
      // unaccent, like the client search: in French, demanding the right accent
      // is demanding the search to fail.
      const needle = `%${input.search}%`
      const match = or(
        sql`unaccent(${projects.name}) ILIKE unaccent(${needle})`,
        ilike(projects.code, needle),
      )
      if (match) filters.push(match)
    }

    return (
      db
        .select({
          id: projects.id,
          name: projects.name,
          code: projects.code,
          status: projects.status,
          priority: projects.priority,
          clientId: projects.clientId,
          clientName: clients.name,
          ownerName: users.name,
          endDate: projects.endDate,
          timezone: projects.timezone,
          // Read, never recomputed: a list of twenty projects would otherwise run
          // twenty aggregates (ADR-013, R5).
          progressPercent: projects.progressPercent,
          actionsTotal: projects.actionsTotal,
          actionsDone: projects.actionsDone,
          memberCount: sql<number>`(
          SELECT count(*)::int FROM project_members pm WHERE pm.project_id = ${projects.id}
        )`,
        })
        .from(projects)
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .leftJoin(users, eq(users.id, projects.ownerUserId))
        .where(and(...filters))
        // Soonest deadline first, and projects with no deadline last: a list
        // sorted by name tells you nothing about what needs attention.
        .orderBy(sql`${projects.endDate} ASC NULLS LAST`, asc(projects.name))
        .limit(200)
    )
  },
})

export const getProject = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'project.read',
  handler: async (input, { actor, db }) => {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        code: projects.code,
        description: projects.description,
        status: projects.status,
        priority: projects.priority,
        color: projects.color,
        clientId: projects.clientId,
        clientName: clients.name,
        ownerUserId: projects.ownerUserId,
        ownerName: users.name,
        startDate: projects.startDate,
        endDate: projects.endDate,
        timezone: projects.timezone,
        budgetAmount: projects.budgetAmount,
        budgetCurrency: projects.budgetCurrency,
        isClientVisible: projects.isClientVisible,
        progressPercent: projects.progressPercent,
        actionsTotal: projects.actionsTotal,
        actionsDone: projects.actionsDone,
        actionsOverdue: projects.actionsOverdue,
      })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(users, eq(users.id, projects.ownerUserId))
      // The same scope as the list: a collaborator who guesses the id of a
      // project they are not on gets nothing, which the page turns into a 404.
      .where(and(eq(projects.id, input.id), isNull(projects.deletedAt), scopedToActor(actor)))
      .limit(1)

    return rows[0] ?? null
  },
})

export const listProjectMembers = defineQuery({
  input: z.object({ projectId: z.uuid() }),
  permission: 'project.read',
  handler: async (input, { actor, db }): Promise<ProjectMemberRow[]> => {
    // Membership of a project is readable only by someone who can read the
    // project: otherwise "who works on this?" would answer for every project.
    const [visible] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), scopedToActor(actor)))
      .limit(1)

    if (!visible) return []

    return db
      .select({
        userId: projectMembers.userId,
        name: users.name,
        email: users.email,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, input.projectId))
      .orderBy(asc(users.name))
  },
})

export const listMilestones = defineQuery({
  input: z.object({ projectId: z.uuid() }),
  permission: 'project.read',
  handler: async (input, { actor, db }): Promise<MilestoneRow[]> => {
    const [visible] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), scopedToActor(actor)))
      .limit(1)

    if (!visible) return []

    return db
      .select({
        id: milestones.id,
        title: milestones.title,
        description: milestones.description,
        dueDate: milestones.dueDate,
        isClientVisible: milestones.isClientVisible,
        reachedAt: sql<
          string | null
        >`to_char(${milestones.reachedAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(milestones)
      .where(and(eq(milestones.projectId, input.projectId), isNull(milestones.deletedAt)))
      .orderBy(sql`${milestones.dueDate} ASC NULLS LAST`, asc(milestones.title))
  },
})

/** For the project form: which clients this project could belong to. */
export const listClientOptions = defineQuery({
  permission: 'client.read',
  handler: async (_input: undefined, { db }): Promise<ClientOption[]> => {
    return db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(isNull(clients.deletedAt), sql`${clients.status} <> 'archived'`))
      .orderBy(asc(clients.name))
      .limit(500)
  },
})

/** For the members panel: who in the organisation could be added. */
export const listColleagueOptions = defineQuery({
  permission: 'member.read',
  handler: async (_input: undefined, { db }): Promise<ColleagueOption[]> => {
    return (
      db
        .select({ userId: users.id, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        // A client contact is not a colleague: they never join a project team.
        .where(and(eq(memberships.status, 'active'), sql`${memberships.role} <> 'client'`))
        .orderBy(asc(users.name))
        .limit(500)
    )
  },
})
