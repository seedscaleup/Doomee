import {
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * ============================================================================
 * The portal.* views, declared for Drizzle.
 *
 * Deliberately NOT exported from `src/db/schema/index.ts`. The schema-drift
 * guard walks that barrel and compares every declaration against `public`;
 * `portal.projects` would collide with `public.projects` by name and make the
 * guard compare the wrong two things.
 *
 * These are READ surfaces. A view is not an insert target here — the portal's
 * two writes go to base tables through policies that carry a WITH CHECK
 * clause, because that clause is what makes a write safe, not the view.
 *
 * Every column below must exist in migration 0015. `tests/integration/
 * portal-leak.test.ts` compares the two, so a view that loses a column fails a
 * test instead of failing a page.
 * ============================================================================
 */
const portal = pgSchema('portal')

export const portalOrganizations = portal.table('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull(),
  timezone: text('timezone').notNull(),
  defaultCurrency: char('default_currency', { length: 3 }).notNull(),
})

export const portalClients = portal.table('clients', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  logoFileId: uuid('logo_file_id'),
})

/** No health score, no budget, no internal counters (ADR-025). */
export const portalProjects = portal.table('projects', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  clientId: uuid('client_id'),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  color: text('color'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  timezone: text('timezone').notNull(),
  progressPercent: integer('progress_percent').notNull(),
})

export const portalMilestones = portal.table('milestones', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: date('due_date'),
  status: text('status').notNull(),
  reachedAt: timestamp('reached_at', { withTimezone: true }),
})

export const portalObjectives = portal.table('objectives', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  objectiveTypeId: uuid('objective_type_id'),
  title: text('title').notNull(),
  description: text('description'),
  metricId: uuid('metric_id'),
  targetValue: numeric('target_value', { precision: 20, scale: 4 }),
  unit: text('unit'),
  currency: char('currency', { length: 3 }),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  status: text('status').notNull(),
  currentValue: numeric('current_value', { precision: 20, scale: 4 }),
  achievementPercent: integer('achievement_percent'),
})

/** No assignee, no minutes, no blocked reason: what is being done, not how it is staffed. */
export const portalActions = portal.table('actions', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  priority: text('priority').notNull(),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const portalDeliverables = portal.table('deliverables', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  deliverableTypeId: uuid('deliverable_type_id'),
  status: text('status').notNull(),
  currentVersionId: uuid('current_version_id'),
  dueDate: date('due_date'),
  sentToClientAt: timestamp('sent_to_client_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  externalUrl: text('external_url'),
})

export const portalDeliverableVersions = portal.table('deliverable_versions', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  deliverableId: uuid('deliverable_id').notNull(),
  version: integer('version').notNull(),
  fileId: uuid('file_id'),
  externalUrl: text('external_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

/** `comment` is NULL for an internal review — the view blanks it (ADR-026). */
export const portalDeliverableReviews = portal.table('deliverable_reviews', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  deliverableId: uuid('deliverable_id').notNull(),
  versionId: uuid('version_id').notNull(),
  scope: text('scope').notNull(),
  decision: text('decision').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const portalResults = portal.table('results', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  actionId: uuid('action_id'),
  objectiveId: uuid('objective_id'),
  title: text('title'),
  recordedFor: date('recorded_for').notNull(),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  analysis: text('analysis'),
  recommendation: text('recommendation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const portalResultMetrics = portal.table('result_metrics', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  resultId: uuid('result_id').notNull(),
  metricId: uuid('metric_id').notNull(),
  fieldKey: text('field_key').notNull(),
  value: numeric('value', { precision: 20, scale: 4 }).notNull(),
  unit: text('unit'),
  currency: char('currency', { length: 3 }),
  recordedFor: date('recorded_for').notNull(),
})

export const portalResultNotes = portal.table('result_notes', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  resultId: uuid('result_id').notNull(),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

export const portalComments = portal.table('comments', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  projectId: uuid('project_id'),
  clientId: uuid('client_id'),
  authorUserId: uuid('author_user_id'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
})

/** No storage_key: a client receives a signed link, never an object key (R13). */
export const portalFiles = portal.table('files', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const portalAttachments = portal.table('attachments', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  fileId: uuid('file_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  projectId: uuid('project_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const portalActivityEvents = portal.table('activity_events', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  actorUserId: uuid('actor_user_id'),
  verb: text('verb').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  clientId: uuid('client_id'),
  projectId: uuid('project_id'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const portalMetrics = portal.table('metrics', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  labels: jsonb('labels').$type<Record<string, string>>().notNull(),
  unit: text('unit'),
  kind: text('kind').notNull(),
  decimals: integer('decimals').notNull(),
})

export const portalDeliverableTypes = portal.table('deliverable_types', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  labels: jsonb('labels').$type<Record<string, string>>().notNull(),
})

export const portalObjectiveTypes = portal.table('objective_types', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  labels: jsonb('labels').$type<Record<string, string>>().notNull(),
})

/** Name and id. Not the e-mail, not the locale, not is_platform_admin. */
export const portalUsers = portal.table('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
})

export const portalClientUserAccess = portal.table('client_user_access', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  clientId: uuid('client_id').notNull(),
  userId: uuid('user_id').notNull(),
})

/**
 * A report reaches a client only once it is PUBLISHED, and `status` is absent
 * from the view because the view never has to say so: the policy has already
 * refused every other row. `snapshot` and `settings` are absent too — the
 * portal reads the SECTIONS, which is the same data in the shape a reader
 * needs (ADR-014, ADR-026).
 */
export const portalReports = portal.table('reports', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  projectId: uuid('project_id'),
  clientId: uuid('client_id'),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  locale: text('locale').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
})

/** `is_included`, `is_client_visible` and `attention_points` are filtered by the policy. */
export const portalReportSections = portal.table('report_sections', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  reportId: uuid('report_id').notNull(),
  key: text('key').notNull(),
  sortOrder: integer('sort_order').notNull(),
  titleOverride: text('title_override'),
  body: text('body'),
  data: jsonb('data').$type<Record<string, unknown> | null>(),
})
