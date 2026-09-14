import { bigint, boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { organizations, users } from './tenancy'

/**
 * Every uploaded object, whoever uploaded it.
 *
 * The row is the permission boundary, not the bucket: `storage_key` is opaque
 * and the object is never public, so reaching a file means passing through a
 * query that checks the organisation first and then hands out a link that
 * expires (R13).
 *
 * `is_client_visible` defaults to FALSE like every other exposure flag: a file
 * becomes visible to a client because someone decided so, never because a
 * column was added (rule 2, ADR-026).
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Opaque, tenant-prefixed. Unique across the bucket. */
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    /** What the bytes ARE, decided by reading them — not by the extension. */
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksum: text('checksum'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    isClientVisible: boolean('is_client_visible').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Composite-FK target: whatever points at a file carries the organisation
    // with it, so a logo can never reference another tenant's object.
    unique('files_org_id_key').on(table.organizationId, table.id),
    index('files_org_created_idx').on(table.organizationId, table.createdAt),
  ],
)
