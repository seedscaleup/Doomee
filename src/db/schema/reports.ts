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
import { clients } from './clients'
import { exportFormat, localeCode, reportSectionKey, reportStatus, reportType } from './enums'
import { files } from './files'
import { projects } from './projects'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * ============================================================================
 * A REPORT IS A DATED DOCUMENT SENT TO A CLIENT.
 *
 * Which is why `snapshot` exists (ADR-014): at publication the data is FROZEN.
 * Reading a published report, exporting it, and opening its share link all
 * read the snapshot and never the live tables.
 *
 * If a published report changed because somebody edited an action afterwards,
 * the PDF in the client's inbox and the page on their screen would disagree —
 * a trust problem, and possibly a contractual one.
 * ============================================================================
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: reportType('type').notNull(),
    title: text('title').notNull(),
    /** The scope: one project, one client across projects, or the whole org. */
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    /**
     * The REPORT's language, chosen when it is created and independent of
     * whoever is reading the interface (ADR-011). A French team writes an
     * English report for an English client without switching their own UI.
     */
    locale: localeCode('locale').notNull().default('fr'),
    status: reportStatus('status').notNull().default('draft'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /**
     * The frozen data (ADR-014). NULL until publication, immutable after.
     *
     * Correcting a published report means publishing a new one — which the
     * interface says out loud rather than silently rewriting history.
     */
    snapshot: jsonb('snapshot').$type<Record<string, unknown> | null>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'reports_org_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'reports_org_client_fk',
    }).onDelete('cascade'),
    unique('reports_org_id_key').on(table.organizationId, table.id),
    index('reports_org_status_idx').on(table.organizationId, table.status, table.periodEnd),
    index('reports_org_client_idx').on(table.organizationId, table.clientId, table.periodEnd),
  ],
)

/**
 * One section, one data provider.
 *
 * `data` is what the provider found; `body` is what a human wrote. Both are
 * kept: the numbers stay checkable and the prose stays theirs. `is_edited`
 * says whether regenerating would destroy someone's writing.
 *
 * `is_client_visible` per SECTION, not per report: "what the client sees" is
 * chosen section by section, which is the whole point of the editor.
 */
export const reportSections = pgTable(
  'report_sections',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id').notNull(),
    key: reportSectionKey('key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isIncluded: boolean('is_included').notNull().default(true),
    isClientVisible: boolean('is_client_visible').notNull().default(true),
    titleOverride: text('title_override'),
    /** What a human wrote. */
    body: text('body'),
    /** What the provider found. */
    data: jsonb('data').$type<Record<string, unknown> | null>(),
    /** True once a human touched it — regenerating must not silently overwrite. */
    isEdited: boolean('is_edited').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.reportId],
      foreignColumns: [reports.organizationId, reports.id],
      name: 'report_sections_org_report_fk',
    }).onDelete('cascade'),
    unique('report_sections_key_key').on(table.reportId, table.key),
    index('report_sections_org_report_idx').on(table.organizationId, table.reportId),
  ],
)

/**
 * ============================================================================
 * A SHARE LINK — the first surface in the product reachable WITHOUT a session.
 *
 * Which is why nothing here is optional:
 *
 * · `token_hash`, never the token. A leaked database must not hand out live
 *   links, exactly as a leaked database must not hand out passwords.
 * · `expires_at` is NOT NULL. A link that never expires is a permanent grant
 *   handed to whoever forwards the e-mail.
 * · `revoked_at` — a mistake must be undoable without deleting the report.
 * · `password_hash` optional, for a report that warrants a second factor.
 *
 * And the page it opens reads the SNAPSHOT, so it touches no live data at all
 * (ADR-014).
 * ============================================================================
 */
export const reportShares = pgTable(
  'report_shares',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id').notNull(),
    /** The hash. The token itself is shown once, at creation, and never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    recipientEmail: text('recipient_email'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.reportId],
      foreignColumns: [reports.organizationId, reports.id],
      name: 'report_shares_org_report_fk',
    }).onDelete('cascade'),
    index('report_shares_org_report_idx').on(table.organizationId, table.reportId),
  ],
)

/** One generated file per format per locale. `pdf` only at the MVP (O4, §14). */
export const reportExports = pgTable(
  'report_exports',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id').notNull(),
    format: exportFormat('format').notNull().default('pdf'),
    fileId: uuid('file_id'),
    locale: localeCode('locale').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.reportId],
      foreignColumns: [reports.organizationId, reports.id],
      name: 'report_exports_org_report_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.fileId],
      foreignColumns: [files.organizationId, files.id],
      name: 'report_exports_org_file_fk',
    }).onDelete('set null'),
    index('report_exports_org_report_idx').on(table.organizationId, table.reportId),
  ],
)
