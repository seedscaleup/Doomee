import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { localeCode, memberStatus, orgRole, orgStatus, subscriptionStatus } from './enums'

/** Case-insensitive text, used for anything a human types as an identifier. */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' })

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * The tenant root. Unlike every other applicative table it carries no
 * organization_id: its own `id` IS the tenant boundary, and its RLS policy is
 * written against `id` (see the hand-written policy migration).
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: citext('slug').notNull().unique(),
  defaultLocale: localeCode('default_locale').notNull().default('fr'),
  timezone: text('timezone').notNull().default('UTC'),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('XOF'),
  /** Health weights, gamification toggle, alert thresholds — validated by Zod. */
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  status: orgStatus('status').notNull().default('active'),
  ...timestamps,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

/**
 * Users are GLOBAL, not tenant-scoped: one person, one account, one language
 * preference, even across several organisations (ADR-023). Membership is what
 * binds them to an organisation, and it carries the role.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: citext('email').notNull().unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    name: text('name').notNull(),
    /** Interface and notification language. */
    locale: localeCode('locale').notNull().default('fr'),
    /** Report language — deliberately independent of the interface (ADR-011). */
    reportLocale: localeCode('report_locale').notNull().default('fr'),
    timezone: text('timezone').notNull().default('UTC'),
    dateFormat: text('date_format').notNull().default('dd/MM/yyyy'),
    /** Platform operator. NOT an organisation role — the two never substitute (ADR-012). */
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('users_email_idx').on(table.email)],
)

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull(),
    status: memberStatus('status').notNull().default('active'),
    jobTitle: text('job_title'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('memberships_org_user_key').on(table.organizationId, table.userId),
    // Composite-FK target: child tables reference (organization_id, id) so a row
    // can never point at a membership belonging to another tenant.
    unique('memberships_org_id_key').on(table.organizationId, table.id),
    index('memberships_org_user_idx').on(table.organizationId, table.userId),
    index('memberships_user_idx').on(table.userId),
  ],
)

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    role: orgRole('role').notNull(),
    /** Only the hash is stored: a leaked backup must not grant access. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('invitations_org_email_idx').on(table.organizationId, table.email),
    index('invitations_org_created_idx').on(table.organizationId, table.createdAt),
  ],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull().default('mvp'),
    status: subscriptionStatus('status').notNull().default('trialing'),
    seatsLimit: integer('seats_limit').notNull().default(10),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [unique('subscriptions_org_key').on(table.organizationId)],
)
