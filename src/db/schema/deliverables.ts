import { sql } from 'drizzle-orm'
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { deliverableStatus, reviewDecision, reviewScope } from './enums'
import { files } from './files'
import { projects } from './projects'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/** Same reference-table shape as every other taxonomy (ADR-010). */
export const deliverableTypes = pgTable(
  'deliverable_types',
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
    uniqueIndex('deliverable_types_scope_code_key').on(
      sql`coalesce(${table.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.code,
    ),
  ],
)

/**
 * What the work produced, and where it stands.
 *
 * A deliverable is the thing a client actually receives: a design, a site, a
 * report, a video. `LIVRABLE` in the central loop, between the action that made
 * it and the result it produced.
 *
 * Its status is a STATE MACHINE, enforced by the pure service and never by a
 * dropdown. The one transition the internal team cannot make is out of
 * `client_review`: approving on the client's behalf would make the whole
 * validation theatre (see the permission matrix — `deliverable.approve` is the
 * client's alone).
 */
export const deliverables = pgTable(
  'deliverables',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** A deliverable may come out of one action, or stand on its own. */
    actionId: uuid('action_id'),
    title: text('title').notNull(),
    description: text('description'),
    /**
     * A PLAIN foreign key: a system type has `organization_id NULL`, which a
     * composite tenant key could never match (ADR-051).
     */
    deliverableTypeId: uuid('deliverable_type_id').references(() => deliverableTypes.id, {
      onDelete: 'set null',
    }),
    status: deliverableStatus('status').notNull().default('draft'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Denormalised pointer to the newest version, so a list does not run a
     * correlated subquery per row (ADR-013). Rewritten in the same transaction
     * as the version it names.
     */
    currentVersionId: uuid('current_version_id'),
    dueDate: date('due_date'),
    /** Opt-in, like every exposure flag (rule 2, ADR-026). */
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    sentToClientAt: timestamp('sent_to_client_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** For a deliverable that IS a link — a live site, a shared drive. */
    externalUrl: text('external_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'deliverables_org_project_fk',
    }).onDelete('cascade'),
    unique('deliverables_org_id_key').on(table.organizationId, table.id),
    index('deliverables_org_project_idx').on(table.organizationId, table.projectId),
    index('deliverables_org_status_idx').on(table.organizationId, table.status, table.dueDate),
  ],
)

/**
 * Every iteration, kept.
 *
 * A version is never overwritten: "which file did the client approve?" has to
 * have an answer months later, and a table that replaces its rows cannot give
 * one. `version` counts from 1 within the deliverable.
 */
export const deliverableVersions = pgTable(
  'deliverable_versions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deliverableId: uuid('deliverable_id').notNull(),
    version: integer('version').notNull(),
    /** A version is a file, or a link, or both — but never neither. */
    fileId: uuid('file_id'),
    externalUrl: text('external_url'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.deliverableId],
      foreignColumns: [deliverables.organizationId, deliverables.id],
      name: 'deliverable_versions_org_deliverable_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.fileId],
      foreignColumns: [files.organizationId, files.id],
      name: 'deliverable_versions_org_file_fk',
    }).onDelete('set null'),
    unique('deliverable_versions_org_id_key').on(table.organizationId, table.id),
    unique('deliverable_versions_number_key').on(
      table.organizationId,
      table.deliverableId,
      table.version,
    ),
  ],
)

/**
 * Who decided what, on which version.
 *
 * `version_id` is not decoration: a change request that does not name the
 * version it is about becomes meaningless the moment a new one is uploaded.
 * Append-only in spirit — a decision that was made stays made.
 */
export const deliverableReviews = pgTable(
  'deliverable_reviews',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deliverableId: uuid('deliverable_id').notNull(),
    /** The exact version reviewed. */
    versionId: uuid('version_id').notNull(),
    scope: reviewScope('scope').notNull(),
    decision: reviewDecision('decision').notNull(),
    comment: text('comment'),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.deliverableId],
      foreignColumns: [deliverables.organizationId, deliverables.id],
      name: 'deliverable_reviews_org_deliverable_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.versionId],
      foreignColumns: [deliverableVersions.organizationId, deliverableVersions.id],
      name: 'deliverable_reviews_org_version_fk',
    }).onDelete('cascade'),
    index('deliverable_reviews_org_deliverable_idx').on(
      table.organizationId,
      table.deliverableId,
      table.createdAt,
    ),
  ],
)
