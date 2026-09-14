import { describe, expect, it } from 'vitest'
import {
  type ClientActor,
  type InternalActor,
  NAV_ENTRIES,
  navigationFor,
  permittedEntries,
  primaryNavigationFor,
  type Role,
} from '@/lib/permissions'

function internal(role: Exclude<Role, 'client'>): InternalActor {
  return {
    kind: 'internal',
    userId: 'u1',
    organizationId: 'o1',
    role,
    locale: 'fr',
    isPlatformAdmin: false,
    projectIds: [],
  }
}

const clientActor: ClientActor = {
  kind: 'client',
  userId: 'u2',
  organizationId: 'o1',
  role: 'client',
  locale: 'fr',
  clientIds: ['c1'],
}

describe('navigation derived from permissions', () => {
  it('always offers home and settings, whatever the role', () => {
    for (const role of ['owner', 'direction', 'manager', 'collaborator'] as const) {
      const keys = navigationFor(internal(role)).map((entry) => entry.key)
      expect(keys).toContain('home')
      expect(keys).toContain('settings')
    }
  })

  it('gives an owner the widest menu', () => {
    const owner = permittedEntries(internal('owner')).length
    const collaborator = permittedEntries(internal('collaborator')).length
    expect(owner).toBeGreaterThan(collaborator)
  })

  it('renders no entry whose route does not exist yet', () => {
    // Offering a menu item that 404s is worse than not offering it. Each lot
    // removes one `planned: true`.
    for (const role of ['owner', 'direction', 'manager', 'collaborator'] as const) {
      expect(navigationFor(internal(role)).filter((entry) => entry.planned)).toEqual([])
    }
  })

  it('still maps every planned entry to a permission', () => {
    // The mapping is the part worth reviewing once; the route follows later.
    const unmapped = NAV_ENTRIES.filter((entry) => entry.planned && !entry.permission)
    expect(unmapped).toEqual([])
  })

  it('never shows a collaborator the team dashboard', () => {
    // Individual performance is management information, not peer information.
    const keys = permittedEntries(internal('collaborator')).map((entry) => entry.key)
    expect(keys).not.toContain('team')
    expect(keys).not.toContain('clients')
  })

  it('shows the client list to direction but never to a collaborator', () => {
    expect(permittedEntries(internal('collaborator')).map((e) => e.key)).not.toContain('clients')
    expect(permittedEntries(internal('direction')).map((e) => e.key)).toContain('clients')
  })

  it('offers a client contact nothing at all from the internal menu', () => {
    // A client legitimately holds action.read and project.read for what is
    // shared with them, so filtering on permissions alone would hand them
    // My Work, Projects and Calendar — the shape of the internal workspace.
    // They get the portal shell instead (LOT 9).
    expect(navigationFor(clientActor)).toEqual([])
    expect(primaryNavigationFor(clientActor)).toEqual([])
  })

  it('keeps the phone bar to four targets at most', () => {
    for (const role of ['owner', 'direction', 'manager', 'collaborator'] as const) {
      expect(primaryNavigationFor(internal(role)).length).toBeLessThanOrEqual(4)
    }
  })

  it('declares no duplicate key or href', () => {
    expect(new Set(NAV_ENTRIES.map((e) => e.key)).size).toBe(NAV_ENTRIES.length)
    expect(new Set(NAV_ENTRIES.map((e) => e.href)).size).toBe(NAV_ENTRIES.length)
  })
})
