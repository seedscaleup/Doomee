import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * State machines live in code, so they are PostgreSQL enums (ADR-010).
 * Their labels live in the i18n catalogues, never in the database.
 */
export const localeCode = pgEnum('locale_code', ['fr', 'en'])

export const orgRole = pgEnum('org_role', [
  'owner',
  'direction',
  'manager',
  'collaborator',
  'client',
])

export const memberStatus = pgEnum('member_status', ['invited', 'active', 'suspended'])

export const orgStatus = pgEnum('org_status', ['active', 'suspended'])

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
])
