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
import { metricAgg, metricDirection, metricKind, objectiveStatus } from './enums'
import { projects } from './projects'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/** Same reference-table shape as every other taxonomy (ADR-010). */
export const objectiveTypes = pgTable(
  'objective_types',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    code: text('code').notNull(),
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    uniqueIndex('objective_types_scope_code_key').on(
      sql`coalesce(${table.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.code,
    ),
  ],
)

/**
 * The catalogue of things that can be measured.
 *
 * A metric is DATA, not code (rule 7): an agency that tracks something we never
 * thought of adds a row. What it carries beyond a label is what makes an
 * objective computable at all — how to aggregate several measurements, and
 * whether more is better.
 *
 * `is_computed` marks a metric derived from others (CTR = clicks/impressions).
 * Those are derived AT READ TIME by the metrics service and never stored twice:
 * a stored ratio is a ratio that disagrees with its own numerator by Tuesday.
 */
export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    code: text('code').notNull(),
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    /** '%', 'FCFA', 'clics'… Free text: a unit is a label, not a state. */
    unit: text('unit'),
    kind: metricKind('kind').notNull().default('integer'),
    aggregation: metricAgg('aggregation').notNull().default('sum'),
    direction: metricDirection('direction').notNull().default('higher_is_better'),
    /** How many decimals to show. Storage is always numeric(20,4). */
    decimals: integer('decimals').notNull().default(0),
    isComputed: boolean('is_computed').notNull().default(false),
    /** 'clicks / impressions' — read by the derived-metrics service (LOT 7). */
    formula: text('formula'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    uniqueIndex('metrics_scope_code_key').on(
      sql`coalesce(${table.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.code,
    ),
    // Composite-FK target: an objective names a metric of its own organisation,
    // or a system one (organization_id NULL) — see the migration.
    unique('metrics_org_id_key').on(table.organizationId, table.id),
  ],
)

/**
 * What a project is trying to achieve — the FIRST step of the Doomee loop.
 *
 * An objective is where "did it work?" becomes answerable: a metric, a target,
 * a period. Without one, results are numbers with nothing to compare them to.
 *
 * `current_value` and `achievement_percent` are denormalised (ADR-013): LOT 7
 * recomputes them in the same transaction as the result that moves them.
 */
export const objectives = pgTable(
  'objectives',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    objectiveTypeId: uuid('objective_type_id').references(() => objectiveTypes.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    /** NULL for an objective that is real but not yet countable. */
    metricId: uuid('metric_id').references(() => metrics.id, { onDelete: 'set null' }),
    targetValue: numeric('target_value', { precision: 20, scale: 4 }),
    unit: text('unit'),
    /**
     * Set when the target is money. Never summed across two currencies, and the
     * gap service refuses to compare two that differ (ADR-024).
     */
    currency: char('currency', { length: 3 }),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    status: objectiveStatus('status').notNull().default('draft'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Unlike most flags this defaults to TRUE: an objective is what the client
     * is paying for, and hiding it by default would make the portal a list of
     * activity with no purpose. What stays internal is the analysis around it.
     */
    isClientVisible: boolean('is_client_visible').notNull().default(true),
    /** Denormalised, rewritten by the result that moves it (LOT 7). */
    currentValue: numeric('current_value', { precision: 20, scale: 4 }),
    achievementPercent: integer('achievement_percent'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'objectives_org_project_fk',
    }).onDelete('cascade'),
    // Composite-FK target: a result metric will point back at an objective
    // without being able to cross a tenant (LOT 7).
    unique('objectives_org_id_key').on(table.organizationId, table.id),
    index('objectives_org_project_idx').on(table.organizationId, table.projectId),
    index('objectives_org_metric_idx').on(table.organizationId, table.metricId),
  ],
)
