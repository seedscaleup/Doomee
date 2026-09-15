import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { entityType, visibility } from './enums'
import { files } from './files'
import { organizations, users } from './tenancy'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * One comments table for every entity that can be discussed.
 *
 * Polymorphic by (entity_type, entity_id) rather than one table per domain: the
 * alternative is eight identical tables and eight identical policies, which is
 * eight places for the visibility default to be got wrong.
 *
 * ⚠️ `visibility` defaults to 'internal'. A comment reaches the client only by
 * a deliberate act — that is the concrete form of "le client ne voit jamais les
 * notes internes" (rule 2). `project_id` and `client_id` are denormalised so
 * the portal's row policy can decide without a polymorphic join, which row
 * level security cannot express (ADR-016).
 */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: entityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    projectId: uuid('project_id'),
    clientId: uuid('client_id'),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    visibility: visibility('visibility').notNull().default('internal'),
    parentCommentId: uuid('parent_comment_id'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('comments_org_id_key').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.parentCommentId],
      foreignColumns: [table.organizationId, table.id],
      name: 'comments_org_parent_fk',
    }).onDelete('cascade'),
    index('comments_org_entity_idx').on(
      table.organizationId,
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
)

/** Being named in a comment. Drives a notification at LOT 14. */
export const commentMentions = pgTable(
  'comment_mentions',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.commentId],
      foreignColumns: [comments.organizationId, comments.id],
      name: 'comment_mentions_org_comment_fk',
    }).onDelete('cascade'),
    index('comment_mentions_org_user_idx').on(table.organizationId, table.userId),
  ],
)

/**
 * A stored file, hung on something.
 *
 * `files` holds the bytes and the permission boundary; this says what the file
 * is attached to. Splitting them is what lets the same object be referenced
 * twice without being stored twice, and lets a file exist before it is placed.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull(),
    entityType: entityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    projectId: uuid('project_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.fileId],
      foreignColumns: [files.organizationId, files.id],
      name: 'attachments_org_file_fk',
    }).onDelete('cascade'),
    unique('attachments_key').on(
      table.organizationId,
      table.fileId,
      table.entityType,
      table.entityId,
    ),
    index('attachments_org_entity_idx').on(table.organizationId, table.entityType, table.entityId),
  ],
)
