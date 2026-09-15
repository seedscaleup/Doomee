import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actions } from './actions'
import { clients } from './clients'
import { fieldKind, resultNoteKind } from './enums'
import { metrics, objectives } from './objectives'
import { projects } from './projects'
import { actionTypes, channels } from './taxonomies'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * ============================================================================
 * SMART FORMS — the pair of tables that makes "the user must not have to fill
 * in fields that do not apply" true.
 *
 * NO RESULTS FORM IS HARD-CODED (ADR-008). The template is chosen by the
 * action's type, its fields are rendered from rows, and the Zod schema that
 * validates them is BUILT AT RUNTIME from those same rows. An agency that
 * measures something we never thought of adds fields, not a deployment.
 * ============================================================================
 */
export const resultFormTemplates = pgTable(
  'result_form_templates',
  {
    id: uuid('id').primaryKey(),
    /** NULL = a system template, shared and not editable. */
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    /** Which action type this form is for. NULL = the generic fallback. */
    actionTypeId: uuid('action_type_id').references(() => actionTypes.id, {
      onDelete: 'cascade',
    }),
    code: text('code').notNull(),
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    /**
     * Templates are versioned rather than edited in place: a result recorded
     * last month was answering the questions of last month's form, and editing
     * the form must not silently change what it meant.
     */
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('result_form_templates_scope_key').on(
      sql`coalesce(${table.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${table.actionTypeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.version,
    ),
  ],
)

export const resultFormFields = pgTable(
  'result_form_fields',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => resultFormTemplates.id, { onDelete: 'cascade' }),
    /** Stable within the template: it is what `result_metrics.field_key` stores. */
    key: text('key').notNull(),
    kind: fieldKind('kind').notNull(),
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    help: jsonb('help').$type<Record<string, string>>(),
    /** Set when the field feeds a metric — which is what makes it aggregatable. */
    metricId: uuid('metric_id').references(() => metrics.id, { onDelete: 'set null' }),
    unit: text('unit'),
    /**
     * Almost always false, deliberately: a result nobody can finish is a result
     * nobody records, and half a measurement beats none (rule 10).
     */
    isRequired: boolean('is_required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    /** For `select`: [{ value, labels }]. */
    options: jsonb('options').$type<{ value: string; labels: Record<string, string> }[]>(),
    defaultValue: text('default_value'),
    min: numeric('min', { precision: 20, scale: 4 }),
    max: numeric('max', { precision: 20, scale: 4 }),
  },
  (table) => [
    unique('result_form_fields_template_key').on(table.templateId, table.key),
    index('result_form_fields_template_idx').on(table.templateId, table.sortOrder),
  ],
)

/**
 * ============================================================================
 * THE RESULT — the heart of the product.
 *
 * `OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE → INSIGHT` : this is where
 * work stops being activity and becomes evidence.
 * ============================================================================
 */
export const results = pgTable(
  'results',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** A result belongs to an action, or to the project directly. */
    actionId: uuid('action_id'),
    objectiveId: uuid('objective_id'),
    /**
     * A PLAIN foreign key, not a composite one.
     *
     * A system template has `organization_id = NULL`, so a composite
     * (organization_id, template_id) key could never match it: the parent row
     * simply has no tenant. Shared reference tables are referenced the way
     * `clients.industry_id` and `actions.action_type_id` are — by id alone.
     * The composite form is for parents that BELONG to a tenant.
     */
    templateId: uuid('template_id').references(() => resultFormTemplates.id, {
      onDelete: 'set null',
    }),
    title: text('title'),
    /**
     * The date the result is ABOUT, not the date it was typed. A campaign
     * reported on Monday for the previous week is filed under the week, or
     * every report about "last month" silently includes this morning.
     */
    recordedFor: date('recorded_for').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    /** "What did we learn?" */
    analysis: text('analysis'),
    /** "What should we do next?" */
    recommendation: text('recommendation'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'results_org_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.actionId],
      foreignColumns: [actions.organizationId, actions.id],
      name: 'results_org_action_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.organizationId, table.objectiveId],
      foreignColumns: [objectives.organizationId, objectives.id],
      name: 'results_org_objective_fk',
    }).onDelete('set null'),
    unique('results_org_id_key').on(table.organizationId, table.id),
    index('results_org_project_recorded_idx').on(
      table.organizationId,
      table.projectId,
      table.recordedFor,
    ),
    index('results_org_recorded_idx').on(table.organizationId, table.recordedFor),
  ],
)

/**
 * The quantitative half, NORMALISED — never a free JSONB blob (ADR-009, R4).
 *
 * The Results module filters and aggregates by client, project, period,
 * collaborator, channel and action type. A JSONB column would make every one of
 * those queries slow and untyped. The dimensions are denormalised onto the row
 * so a dashboard does not join four tables per chart.
 */
export const resultMetrics = pgTable(
  'result_metrics',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    resultId: uuid('result_id').notNull(),
    metricId: uuid('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),
    /** Which field of the template produced it — the audit trail of a number. */
    fieldKey: text('field_key').notNull(),
    value: numeric('value', { precision: 20, scale: 4 }).notNull(),
    unit: text('unit'),
    /** Money carries its currency, always (ADR-024). */
    currency: char('currency', { length: 3 }),
    objectiveId: uuid('objective_id'),
    /** Denormalised dimensions: the analytics read these, never a join chain. */
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    actionTypeId: uuid('action_type_id').references(() => actionTypes.id, {
      onDelete: 'set null',
    }),
    recordedFor: date('recorded_for').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.resultId],
      foreignColumns: [results.organizationId, results.id],
      name: 'result_metrics_org_result_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'result_metrics_org_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'result_metrics_org_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.objectiveId],
      foreignColumns: [objectives.organizationId, objectives.id],
      name: 'result_metrics_org_objective_fk',
    }).onDelete('set null'),
    unique('result_metrics_result_field_key').on(
      table.organizationId,
      table.resultId,
      table.fieldKey,
    ),
    index('result_metrics_org_metric_date_idx').on(
      table.organizationId,
      table.metricId,
      table.recordedFor,
    ),
    index('result_metrics_org_project_metric_idx').on(
      table.organizationId,
      table.projectId,
      table.metricId,
    ),
    index('result_metrics_org_client_metric_idx').on(
      table.organizationId,
      table.clientId,
      table.metricId,
      table.recordedFor,
    ),
  ],
)

/**
 * The qualitative half.
 *
 * One table rather than eight columns: reports iterate over the kinds
 * generically, and adding a ninth kind is an enum value, not a migration of
 * every reader (docs/database.md §7).
 */
export const resultNotes = pgTable(
  'result_notes',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    resultId: uuid('result_id').notNull(),
    kind: resultNoteKind('kind').notNull(),
    body: text('body').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.resultId],
      foreignColumns: [results.organizationId, results.id],
      name: 'result_notes_org_result_fk',
    }).onDelete('cascade'),
    index('result_notes_org_result_idx').on(table.organizationId, table.resultId, table.sortOrder),
  ],
)
