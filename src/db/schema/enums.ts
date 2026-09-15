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

export const clientStatus = pgEnum('client_status', ['prospect', 'active', 'paused', 'archived'])

export const projectStatus = pgEnum('project_status', [
  'to_start',
  'in_progress',
  'in_review',
  'paused',
  'blocked',
  'done',
  'archived',
])

/** Shared by projects, actions and anything else that can be urgent. */
export const priorityLevel = pgEnum('priority_level', ['low', 'normal', 'high', 'urgent'])

/**
 * The internal health verdict (ADR-013). Never reaches the portal: it is a
 * steering tool for the team, not a grade shown to the client (ADR-025).
 */
export const healthStatus = pgEnum('health_status', ['healthy', 'at_risk', 'blocked'])

export const milestoneStatus = pgEnum('milestone_status', ['upcoming', 'reached', 'missed'])

/**
 * What someone does ON a project, which is not what they may do IN the
 * organisation: a manager can be a plain member of a project they do not lead.
 * Organisation role decides permissions; this decides responsibility.
 */
export const projectMemberRole = pgEnum('project_member_role', ['lead', 'member', 'reviewer'])

/**
 * Who a row is for. `internal` is the default everywhere: a client sees
 * something only after a deliberate act (ADR-017).
 */
export const visibility = pgEnum('visibility', ['internal', 'shared'])

/**
 * The entities an activity event, a comment or an attachment can point at.
 *
 * Declared in full now, including the ones later lots introduce: adding a value
 * to a PostgreSQL enum is a migration, and doing it once beats doing it eight
 * times. An unused value costs nothing.
 */
export const entityType = pgEnum('entity_type', [
  'client',
  'project',
  'action',
  'objective',
  'deliverable',
  'result',
  'insight',
  'report',
  'risk',
  'meeting',
  'milestone',
])
