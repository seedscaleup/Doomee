import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { clients } from './clients'
import {
  healthStatus,
  milestoneStatus,
  priorityLevel,
  projectMemberRole,
  projectStatus,
} from './enums'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** An internal project has no client, and that is a normal case. */
    clientId: uuid('client_id'),
    name: text('name').notNull(),
    /** Short human handle shown in lists and mentions: "REFONTE-25". */
    code: text('code'),
    description: text('description'),
    status: projectStatus('status').notNull().default('to_start'),
    priority: priorityLevel('priority').notNull().default('normal'),
    /** Visual identity in lists and calendars. A token name, never a raw hex. */
    color: text('color'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    /**
     * The project's own timezone, inherited from the organisation at creation.
     * "Late" is a question about a calendar day, and a calendar day only exists
     * in a timezone (R9) — so the answer must not depend on where the reader is.
     */
    timezone: text('timezone').notNull().default('UTC'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Money always carries its currency, and is never summed across two (ADR-024). */
    budgetAmount: numeric('budget_amount', { precision: 18, scale: 2 }),
    budgetCurrency: char('budget_currency', { length: 3 }),
    /**
     * Unlike everything else, a project defaults to VISIBLE: a client account
     * exists to follow its projects. What stays internal by default is the
     * content inside — comments, deliverables, the health score (rule 2).
     */
    isClientVisible: boolean('is_client_visible').notNull().default(true),

    /**
     * Denormalised on purpose (ADR-013, R5). A project list showing twenty
     * projects would otherwise run twenty aggregate queries, and the dashboard
     * more. These are maintained in the SAME transaction as the mutation that
     * changes them, and reconciled by a nightly job.
     *
     * The action counters stay at zero until LOT 5 creates actions to count.
     */
    progressPercent: integer('progress_percent').notNull().default(0),
    actionsTotal: integer('actions_total').notNull().default(0),
    actionsDone: integer('actions_done').notNull().default(0),
    actionsOverdue: integer('actions_overdue').notNull().default(0),
    deliverablesPendingClient: integer('deliverables_pending_client').notNull().default(0),
    openRisksCount: integer('open_risks_count').notNull().default(0),

    /** Internal steering only. Absent from the portal views by construction (ADR-025). */
    healthScore: integer('health_score'),
    healthStatus: healthStatus('health_status'),
    healthComputedAt: timestamp('health_computed_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'projects_org_client_fk',
    }).onDelete('restrict'),
    // Composite-FK target: a member, a milestone or an action can never point
    // at another tenant's project.
    unique('projects_org_id_key').on(table.organizationId, table.id),
    unique('projects_org_code_key').on(table.organizationId, table.code),
    index('projects_org_status_idx').on(table.organizationId, table.status),
    index('projects_org_client_idx').on(table.organizationId, table.clientId),
    index('projects_org_end_date_idx').on(table.organizationId, table.endDate),
  ],
)

/**
 * THE TABLE THAT DEFINES A COLLABORATOR'S SCOPE.
 *
 * A collaborator reads the projects they are a member of, and no others. That
 * is not a filter the interface applies for tidiness: it is the second security
 * barrier, checked in the query and tested on its own.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectMemberRole('role').notNull().default('member'),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'project_members_org_project_fk',
    }).onDelete('cascade'),
    unique('project_members_key').on(table.organizationId, table.projectId, table.userId),
    index('project_members_org_user_idx').on(table.organizationId, table.userId),
  ],
)

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: date('due_date'),
    status: milestoneStatus('status').notNull().default('upcoming'),
    /** Opt-in, like every exposure flag (rule 2). */
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    reachedAt: timestamp('reached_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'milestones_org_project_fk',
    }).onDelete('cascade'),
    index('milestones_org_project_due_idx').on(
      table.organizationId,
      table.projectId,
      table.dueDate,
    ),
  ],
)
