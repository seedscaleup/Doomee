import type { orgRole } from '@/db/schema'

export type Role = (typeof orgRole.enumValues)[number]

/**
 * Every capability in the product, as data.
 *
 * CLAUDE.md §6: this matrix IS the authorisation rule. There are no
 * `if (role === 'manager')` checks scattered through the code — a permission
 * that is not listed here does not exist, and a role that is not listed for a
 * permission cannot perform it.
 *
 * It mirrors docs/cahier-des-charges.md §3.2 one-for-one, and
 * tests/unit/permissions.test.ts fails if the two ever diverge.
 *
 * Note what is NOT here: `platform_admin`. It is an attribute of users, not an
 * organisation role (ADR-012), and it is checked separately. Listing it would
 * blur exactly the line the commanditaire asked us to keep sharp.
 */
export const PERMISSIONS = {
  // Organisation
  'organization.update': ['owner'],
  'organization.read_settings': ['owner', 'direction'],
  'organization.manage_billing': ['owner'],
  'organization.delete': ['owner'],

  // Members
  'member.invite': ['owner', 'manager'],
  'member.read': ['owner', 'direction', 'manager'],
  'member.change_role': ['owner'],
  'member.deactivate': ['owner'],

  // Taxonomies (LOT 5+)
  'taxonomy.read': ['owner', 'direction', 'manager', 'collaborator'],
  'taxonomy.create': ['owner', 'manager'],
  'taxonomy.update': ['owner'],

  // Clients (LOT 3)
  'client.create': ['owner', 'direction', 'manager'],
  'client.update': ['owner', 'direction', 'manager'],
  'client.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],
  'client.archive': ['owner', 'direction'],
  'client.invite_contact': ['owner', 'direction', 'manager'],

  // Projects (LOT 4)
  'project.create': ['owner', 'direction', 'manager'],
  'project.update': ['owner', 'direction', 'manager'],
  'project.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],
  'project.read_all': ['owner', 'direction', 'manager'],
  'project.archive': ['owner', 'manager'],

  // Objectives (LOT 6)
  'objective.create': ['owner', 'direction', 'manager'],
  'objective.update': ['owner', 'direction', 'manager'],
  'objective.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Actions (LOT 5)
  'action.create': ['owner', 'manager'],
  'action.update_any': ['owner', 'manager'],
  'action.update_own': ['owner', 'manager', 'collaborator'],
  'action.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Results (LOT 7)
  'result.create': ['owner', 'manager', 'collaborator'],
  'result.update_any': ['owner', 'manager'],
  'result.update_own': ['owner', 'manager', 'collaborator'],
  'result.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Deliverables (LOT 8)
  'deliverable.create': ['owner', 'manager', 'collaborator'],
  'deliverable.review_internal': ['owner', 'manager'],
  'deliverable.send_to_client': ['owner', 'manager'],
  /** Only the client approves. Nobody internal can approve on their behalf. */
  'deliverable.approve': ['client'],
  'deliverable.request_changes': ['client'],
  'deliverable.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Comments
  'comment.create_internal': ['owner', 'direction', 'manager', 'collaborator'],
  'comment.create_shared': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Insights (LOT 10)
  'insight.create': ['owner', 'direction', 'manager', 'collaborator'],
  'insight.convert_to_action': ['owner', 'manager'],
  'insight.read': ['owner', 'direction', 'manager', 'collaborator'],

  // Reports (LOT 12)
  'report.create': ['owner', 'direction', 'manager'],
  'report.publish': ['owner', 'direction', 'manager'],
  'report.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],
  'report.export': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Risks (LOT 11)
  'risk.create': ['owner', 'direction', 'manager', 'collaborator'],
  'risk.update': ['owner', 'direction', 'manager'],
  'risk.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],

  // Team and performance — never visible to a client.
  'team.read_dashboard': ['owner', 'direction', 'manager'],
  'team.read_individual_performance': ['owner', 'direction', 'manager'],

  // Activity and audit
  'activity.read': ['owner', 'direction', 'manager', 'collaborator', 'client'],
  'audit.read': ['owner'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]
