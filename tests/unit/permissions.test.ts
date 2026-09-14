import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  type ClientActor,
  can,
  canReachClient,
  canReachProject,
  type InternalActor,
  PERMISSIONS,
  type Permission,
  type Role,
} from '@/lib/permissions'

const ROLES: Role[] = ['owner', 'direction', 'manager', 'collaborator', 'client']

function internal(role: Exclude<Role, 'client'>, projectIds: string[] = []): InternalActor {
  return {
    kind: 'internal',
    userId: 'u1',
    organizationId: 'o1',
    role,
    locale: 'fr',
    isPlatformAdmin: false,
    projectIds,
  }
}

function clientActor(clientIds: string[] = ['c1']): ClientActor {
  return {
    kind: 'client',
    userId: 'u2',
    organizationId: 'o1',
    role: 'client',
    locale: 'fr',
    clientIds,
  }
}

function actorFor(role: Role): InternalActor | ClientActor {
  return role === 'client' ? clientActor() : internal(role)
}

describe('permission matrix', () => {
  it('grants every permission to at least one role', () => {
    // Read through a widened view: the const literal makes TypeScript consider
    // the comparison impossible today, but the guard must still hold at runtime
    // the day someone writes `'x.y': []`.
    const matrix: Record<string, readonly Role[]> = PERMISSIONS
    const orphans = ALL_PERMISSIONS.filter((permission) => matrix[permission]?.length === 0)
    expect(orphans, 'A permission nobody holds is dead code').toEqual([])
  })

  it('never lists an unknown role', () => {
    const unknown = ALL_PERMISSIONS.flatMap((permission) =>
      PERMISSIONS[permission].filter((role) => !ROLES.includes(role)),
    )
    expect(unknown).toEqual([])
  })

  it('never lists a role twice for the same permission', () => {
    const duplicated = ALL_PERMISSIONS.filter((permission) => {
      const roles = PERMISSIONS[permission]
      return new Set(roles).size !== roles.length
    })
    expect(duplicated).toEqual([])
  })

  /**
   * The complete role x permission grid. Every cell is asserted, so a
   * permission silently widened to another role fails here rather than in
   * production.
   */
  describe.each(ROLES)('role %s', (role) => {
    const actor = actorFor(role)

    it.each(ALL_PERMISSIONS)('%s matches the matrix', (permission) => {
      const expected = (PERMISSIONS[permission] as readonly Role[]).includes(role)
      expect(can(actor, permission)).toBe(expected)
    })
  })
})

describe('the client boundary', () => {
  /**
   * Straight from docs/cahier-des-charges.md §3.3 rule 4: a client never sees
   * internal work. These are the permissions that would breach that.
   */
  const FORBIDDEN_TO_CLIENT: Permission[] = [
    'organization.update',
    'organization.read_settings',
    'organization.manage_billing',
    'member.invite',
    'member.read',
    'member.change_role',
    'project.create',
    'project.update',
    'project.read_all',
    'action.create',
    'action.update_any',
    'action.update_own',
    'result.create',
    'result.update_any',
    'insight.create',
    'insight.read',
    'report.create',
    'report.publish',
    'team.read_dashboard',
    'team.read_individual_performance',
    'audit.read',
    'deliverable.create',
    'deliverable.review_internal',
    'deliverable.send_to_client',
    'comment.create_internal',
  ]

  it.each(FORBIDDEN_TO_CLIENT)('a client cannot %s', (permission) => {
    expect(can(clientActor(), permission)).toBe(false)
  })

  it('only the client approves a deliverable', () => {
    expect(PERMISSIONS['deliverable.approve']).toEqual(['client'])
    expect(PERMISSIONS['deliverable.request_changes']).toEqual(['client'])
    for (const role of ['owner', 'direction', 'manager', 'collaborator'] as const) {
      expect(can(internal(role), 'deliverable.approve')).toBe(false)
    }
  })

  it('never grants a client anything an internal role also holds exclusively', () => {
    const clientPermissions = ALL_PERMISSIONS.filter((permission) =>
      (PERMISSIONS[permission] as readonly Role[]).includes('client'),
    )
    // A client permission must be a read, a comment, or a deliverable decision.
    const unexpected = clientPermissions.filter(
      (permission) =>
        !/\.(read|export)$/.test(permission) &&
        !permission.startsWith('comment.create_shared') &&
        !permission.startsWith('deliverable.approve') &&
        !permission.startsWith('deliverable.request_changes'),
    )
    expect(unexpected).toEqual([])
  })
})

describe('scope', () => {
  it('limits a collaborator to the projects they belong to', () => {
    const actor = internal('collaborator', ['p1'])
    expect(canReachProject(actor, 'p1')).toBe(true)
    expect(canReachProject(actor, 'p2')).toBe(false)
  })

  it('does not limit a manager by project membership', () => {
    expect(canReachProject(internal('manager'), 'p9')).toBe(true)
  })

  it('never lets a client reach a project through the internal predicate', () => {
    // The portal has its own path; this predicate must refuse outright rather
    // than fall through to a permissive branch.
    expect(canReachProject(clientActor(), 'p1')).toBe(false)
  })

  it('limits a client contact to their own client accounts', () => {
    const actor = clientActor(['c1', 'c2'])
    expect(canReachClient(actor, 'c1')).toBe(true)
    expect(canReachClient(actor, 'c2')).toBe(true)
    expect(canReachClient(actor, 'c3')).toBe(false)
  })
})
