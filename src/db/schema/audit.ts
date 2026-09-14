import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizations, users } from './tenancy'

/**
 * Security audit trail. INSERT-ONLY: no role, not even app_user, may UPDATE or
 * DELETE a row (enforced by grants in the policy migration).
 *
 * organization_id is nullable because platform-level actions (a Super Admin
 * suspending an organisation, a failed sign-in) happen outside any tenant.
 * It therefore carries NO row level security and is never reachable from the
 * portal pool — see docs/database.md §11.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Dotted verb: 'organization.suspended', 'membership.role_changed', 'report.shared'. */
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_org_created_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_action_idx').on(table.action),
  ],
)
