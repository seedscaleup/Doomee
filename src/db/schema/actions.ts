import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actionStatus, priorityLevel } from './enums'
import { projects } from './projects'
import { actionCategories, actionTypes, channels } from './taxonomies'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * The unit of work — and the second step of the Doomee loop.
 *
 * An action is not a task in a task manager: it belongs to a project, it has a
 * TYPE that will decide which results form it gets when it closes (ADR-008),
 * and it is the row a result eventually points back at. Everything here exists
 * to make `OBJECTIF → ACTION → LIVRABLE → RÉSULTAT` walkable.
 */
export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: actionStatus('status').notNull().default('todo'),
    priority: priorityLevel('priority').notNull().default('normal'),
    /** Decides the results form at LOT 7. Classification, so a table (ADR-010). */
    actionTypeId: uuid('action_type_id').references(() => actionTypes.id, {
      onDelete: 'set null',
    }),
    categoryId: uuid('category_id').references(() => actionCategories.id, {
      onDelete: 'set null',
    }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    /** THE person accountable. Collaborators are extra hands, not extra owners. */
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    startDate: date('start_date'),
    /**
     * A calendar day, not an instant. What "late" means is decided against the
     * PROJECT's timezone by a pure function, never by the reader's clock (R9,
     * ADR-039).
     */
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Manual entry at MVP. No timer: that is V2 (ADR-018). */
    estimatedMinutes: integer('estimated_minutes'),
    spentMinutes: integer('spent_minutes'),
    /** Opt-in, like every exposure flag (rule 2). */
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    /** Why it is stuck. Required by the service when the status is `blocked`. */
    blockedReason: text('blocked_reason'),
    /** Manual order within a kanban column. */
    position: integer('position').notNull().default(0),
    /**
     * Where this action CAME FROM — the last edge of the loop
     * (`INSIGHT → RECOMMANDATION → PROCHAINE ACTION`).
     *
     * A plain nullable uuid rather than a composite FK to `insights`: declaring
     * it here would make `actions.ts` import `insights.ts`, which imports
     * `actions.ts` for `insight_actions`. The constraint is added in migration
     * 0016, where both tables already exist, and the schema-drift test checks
     * that the column is declared on both sides (ADR-036).
     */
    sourceInsightId: uuid('source_insight_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'actions_org_project_fk',
    }).onDelete('cascade'),
    // Composite-FK target: a collaborator, a comment or a result can never
    // point at another tenant's action.
    unique('actions_org_id_key').on(table.organizationId, table.id),
    index('actions_org_project_status_idx').on(table.organizationId, table.projectId, table.status),
    // My Work reads this one: mine, by deadline.
    index('actions_org_assignee_due_idx').on(table.organizationId, table.assigneeId, table.dueDate),
    index('actions_org_due_idx').on(table.organizationId, table.dueDate),
  ],
)

/**
 * Extra hands on an action.
 *
 * Separate from `assignee_id` on purpose: one person answers for an action, and
 * "everyone is responsible" is how nobody is. Collaborators are listed, counted
 * and notified; they are not accountable.
 */
export const actionCollaborators = pgTable(
  'action_collaborators',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actionId: uuid('action_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.actionId],
      foreignColumns: [actions.organizationId, actions.id],
      name: 'action_collaborators_org_action_fk',
    }).onDelete('cascade'),
    unique('action_collaborators_key').on(table.organizationId, table.actionId, table.userId),
    index('action_collaborators_org_user_idx').on(table.organizationId, table.userId),
  ],
)
