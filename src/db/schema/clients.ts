import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { clientStatus } from './enums'
import { industries } from './taxonomies'
import { citext, organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'set null' }),
    /**
     * The composite foreign key (organization_id, logo_file_id) -> files is in
     * the 0008 migration: `files` would have to import this file for the
     * reverse direction, and declaring it here closes the cycle.
     */
    logoFileId: uuid('logo_file_id'),
    description: text('description'),
    website: text('website'),
    email: citext('email'),
    phone: text('phone'),
    address: text('address'),
    status: clientStatus('status').notNull().default('active'),
    /** The internal person accountable for this client. */
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Internal notes about the account team. Never reaches the portal: it is
     * absent from the portal views, not merely flagged (ADR-026).
     */
    accountTeamNote: text('account_team_note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('clients_org_slug_key').on(table.organizationId, table.slug),
    // Composite-FK target: a child row can never point at another tenant's client.
    unique('clients_org_id_key').on(table.organizationId, table.id),
    index('clients_org_status_idx').on(table.organizationId, table.status),
    index('clients_org_name_idx').on(table.organizationId, table.name),
  ],
)

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    email: citext('email').notNull(),
    phone: text('phone'),
    jobTitle: text('job_title'),
    /** The "responsable côté client" of the cahier des charges. */
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Set once the contact has been invited to the portal and has an account. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'client_contacts_org_client_fk',
    }).onDelete('cascade'),
    /**
     * Unique on (client, email), never on email alone: the same person is a
     * legitimate contact of several clients, and of several organisations
     * (ADR-023).
     */
    unique('client_contacts_client_email_key').on(
      table.organizationId,
      table.clientId,
      table.email,
    ),
    index('client_contacts_org_client_idx').on(table.organizationId, table.clientId),
  ],
)

/**
 * Which client accounts a portal user may see.
 *
 * Deferred here from LOT 1 with the clients table it depends on. Several rows
 * per user is the normal case, not the exception: a group or holding contact
 * follows several subsidiaries (ADR-023), which is why app.client_ids is a
 * LIST in the portal's tenant context.
 */
export const clientUserAccess = pgTable(
  'client_user_access',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'client_user_access_org_client_fk',
    }).onDelete('cascade'),
    unique('client_user_access_key').on(table.organizationId, table.userId, table.clientId),
    index('client_user_access_user_idx').on(table.organizationId, table.userId),
  ],
)
