import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organizations } from './tenancy'

/**
 * Reference data, not code (ADR-010).
 *
 * organization_id NULL means a system entry: shared by everyone, seeded, not
 * editable. A non-null one belongs to a single organisation, which is how a
 * team adds its own sector or channel without a deployment — the "no hard-coded
 * business data" rule made concrete.
 *
 * Labels live in the row, in every supported language, because a taxonomy value
 * is data and data is not in the message catalogues.
 */
export const industries = pgTable(
  'industries',
  {
    id: uuid('id').primaryKey(),
    /** NULL = system entry, shared and read-only. */
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    /** Stable identifier used by code and by seeds: 'marketing', 'retail'… */
    code: text('code').notNull(),
    /**
     * { "fr": "Distribution", "en": "Retail" }
     *
     * Typed rather than left as unknown: the shape is known, and every caller
     * would otherwise have to assert it — which is how an assertion ends up
     * being wrong somewhere.
     */
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    // A system entry and an organisation entry may share a code; two entries of
    // the same organisation may not. COALESCE gives NULL a comparable value.
    uniqueIndex('industries_scope_code_key').on(
      sql`coalesce(${table.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.code,
    ),
  ],
)
