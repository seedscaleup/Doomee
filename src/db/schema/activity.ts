import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { entityType, visibility } from './enums'
import { organizations, users } from './tenancy'

/**
 * The activity feed and the client history are the same table.
 *
 * It stores a VERB plus parameters, never a sentence: "Sandra a terminé
 * Carrousel #12" and "Sandra completed Carousel #12" are the same event read by
 * two people in two languages (ADR-011). Storing the text would freeze it in
 * whichever language the actor happened to be using.
 *
 * Append-only: no UPDATE, no DELETE, not even for app_user. A history that can
 * be rewritten is not a history. That also makes it partitionable later without
 * touching application code (ADR-022).
 */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** NULL when the system acted: a scheduled job, an automation. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Dotted verb: 'client.created', 'action.completed', 'deliverable.approved'. */
    verb: text('verb').notNull(),
    entityType: entityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    /**
     * Denormalised so the feed can be filtered, and so the portal's row policy
     * can decide without a polymorphic join — which row level security cannot
     * express (ADR-016).
     */
    clientId: uuid('client_id'),
    projectId: uuid('project_id'),
    /** Interpolated into the localised sentence at render time. */
    params: jsonb('params').notNull().default({}),
    visibility: visibility('visibility').notNull().default('internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('activity_events_org_client_idx').on(
      table.organizationId,
      table.clientId,
      table.createdAt,
    ),
    index('activity_events_org_project_idx').on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    index('activity_events_org_entity_idx').on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
  ],
)
