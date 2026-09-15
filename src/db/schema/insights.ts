import {
  boolean,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actions } from './actions'
import { clients } from './clients'
import { projects } from './projects'
import { results } from './results'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * ============================================================================
 * THE LAST TWO STEPS OF THE LOOP.
 *
 *   OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE →
 *   **INSIGHT → RECOMMANDATION → PROCHAINE ACTION**
 *
 * A result says what happened. An insight says what it MEANS — and, crucially,
 * what to do about it. Without this table the product stops at "here are your
 * numbers", which is the thing Doomee exists not to be.
 *
 * The four fields are deliberately the four questions an agency actually asks
 * in a review meeting, in that order. They are text, not structure: an insight
 * is written by a human for a human, and a form that demanded structure would
 * get "n/a" four times.
 * ============================================================================
 */
export const insights = pgTable(
  'insights',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /**
     * An insight sits on a project, on a client across projects, or on neither
     * — a lesson learned about the agency's own practice is a legitimate
     * insight with no owner but the organisation.
     */
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    title: text('title').notNull(),
    /** The four questions of a review meeting, in the order they get asked. */
    whatWorked: text('what_worked'),
    whatDidnt: text('what_didnt'),
    whatWeLearned: text('what_we_learned'),
    recommendation: text('recommendation'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    /** Opt-in, like every exposure flag (rule 2, ADR-026). */
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'insights_org_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'insights_org_client_fk',
    }).onDelete('cascade'),
    unique('insights_org_id_key').on(table.organizationId, table.id),
    index('insights_org_project_idx').on(table.organizationId, table.projectId),
    index('insights_org_client_idx').on(table.organizationId, table.clientId, table.createdAt),
  ],
)

/**
 * Which results an insight is BUILT ON.
 *
 * This is what separates an insight from an opinion. "The carousel format
 * works better" is a claim; the same sentence with three results attached is a
 * finding someone can check.
 */
export const insightResults = pgTable(
  'insight_results',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    insightId: uuid('insight_id').notNull(),
    resultId: uuid('result_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.insightId, table.resultId] }),
    foreignKey({
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
      name: 'insight_results_org_insight_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.resultId],
      foreignColumns: [results.organizationId, results.id],
      name: 'insight_results_org_result_fk',
    }).onDelete('cascade'),
    index('insight_results_org_result_idx').on(table.organizationId, table.resultId),
  ],
)

/**
 * The actions a recommendation GAVE BIRTH TO — the loop closing.
 *
 * `actions.source_insight_id` carries the same link from the other side, so an
 * action's own screen can say where it came from without a join through this
 * table. Both exist on purpose: one answers "what came out of this insight?",
 * the other "why does this action exist?".
 */
export const insightActions = pgTable(
  'insight_actions',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    insightId: uuid('insight_id').notNull(),
    actionId: uuid('action_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.insightId, table.actionId] }),
    foreignKey({
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
      name: 'insight_actions_org_insight_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.actionId],
      foreignColumns: [actions.organizationId, actions.id],
      name: 'insight_actions_org_action_fk',
    }).onDelete('cascade'),
    index('insight_actions_org_action_idx').on(table.organizationId, table.actionId),
  ],
)
