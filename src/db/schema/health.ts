import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { healthStatus, riskKind, riskLevel, riskStatus } from './enums'
import { projects } from './projects'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * ============================================================================
 * WHAT COULD GO WRONG, AND WHAT ALREADY HAS.
 *
 * One table for both (see `risk_kind`): they share every field, and two tables
 * would drift apart the first time a column is added to one of them.
 * ============================================================================
 */
export const risks = pgTable(
  'risks',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    kind: riskKind('kind').notNull().default('risk'),
    title: text('title').notNull(),
    description: text('description'),
    level: riskLevel('level').notNull().default('medium'),
    impact: text('impact'),
    probability: text('probability'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    identifiedOn: date('identified_on'),
    mitigationPlan: text('mitigation_plan'),
    status: riskStatus('status').notNull().default('open'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /**
     * Opt-in, like every exposure flag (rule 2). A risk shared with a client is
     * a deliberate act of transparency; the rest is how the team talks about
     * the work among themselves.
     */
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
      name: 'risks_org_project_fk',
    }).onDelete('cascade'),
    unique('risks_org_id_key').on(table.organizationId, table.id),
    index('risks_org_project_idx').on(table.organizationId, table.projectId, table.status),
    index('risks_org_level_idx').on(table.organizationId, table.level, table.status),
  ],
)

/**
 * ============================================================================
 * THE HEALTH SCORE, kept as a history rather than a single number.
 *
 * `projects.health_score` holds the CURRENT value, denormalised so a list can
 * sort by it (ADR-013). This table holds every value it has ever had — which
 * is what turns "the project is at risk" into "the project has been sliding
 * for three weeks", the only version of the statement anyone can act on.
 *
 * 🔒 NEVER exposed to a client, by any route (ADR-025). There is no
 * `portal.project_health_snapshots` view and there never will be.
 * ============================================================================
 */
export const projectHealthSnapshots = pgTable(
  'project_health_snapshots',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    score: integer('score').notNull(),
    status: healthStatus('status').notNull(),
    /**
     * The factors, as `code` + `params` — NEVER as a sentence.
     *
     * "3 actions sont en retard" is rendered from `{ code: 'overdue_actions',
     * params: { count: 3 } }` by the i18n catalogue, so the same stored row
     * reads in French for one colleague and in English for another, with no
     * recomputation (ADR-011). A stored sentence is a sentence in one language
     * forever.
     */
    factors: jsonb('factors')
      .$type<{ code: string; weight: number; score: number; params: Record<string, number> }[]>()
      .notNull()
      .default([]),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'project_health_snapshots_org_project_fk',
    }).onDelete('cascade'),
    // The history is read newest-first, per project. Append-only in spirit:
    // a snapshot is what the score WAS at a moment.
    index('project_health_snapshots_org_project_idx').on(
      table.organizationId,
      table.projectId,
      table.computedAt,
    ),
  ],
)
