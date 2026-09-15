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

export const actionStatus = pgEnum('action_status', [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'cancelled',
])

/**
 * The eight kinds of qualitative note a result can carry.
 *
 * An enum rather than eight columns: reports iterate over them generically, and
 * the list grows without a migration to every reader (docs/database.md §7).
 */
export const resultNoteKind = pgEnum('result_note_kind', [
  'observation',
  'audience_feedback',
  'client_feedback',
  'difficulty',
  'positive',
  'negative',
  'learning',
  'opportunity',
])

/**
 * What a smart-form field IS, which decides how it renders and how it is
 * validated. A state machine of sorts, so an enum and not a table (ADR-010).
 */
export const fieldKind = pgEnum('field_kind', [
  'number',
  'percent',
  'currency',
  'text',
  'longtext',
  'url',
  'date',
  'select',
  'boolean',
])

export const objectiveStatus = pgEnum('objective_status', [
  'draft',
  'active',
  'achieved',
  'missed',
  'cancelled',
])

/** What a metric's numbers ARE — decides how they are formatted and summed. */
export const metricKind = pgEnum('metric_kind', [
  'integer',
  'decimal',
  'currency',
  'percent',
  'ratio',
  'duration',
])

/** How several measurements of one metric become one number over a period. */
export const metricAgg = pgEnum('metric_agg', ['sum', 'avg', 'last', 'max', 'min'])

/**
 * Whether more is better. Without it, "we are 20% off target" says nothing:
 * 20% below on revenue is a miss, 20% below on cost per lead is a win.
 */
export const metricDirection = pgEnum('metric_direction', [
  'higher_is_better',
  'lower_is_better',
  'neutral',
])

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
