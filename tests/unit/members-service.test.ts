import { describe, expect, it } from 'vitest'
import {
  canChangeRole,
  canDeactivate,
  hasSeatAvailable,
  INVITATION_TTL_DAYS,
  invitationExpiry,
  invitationState,
} from '@/modules/members/service'

const NOW = new Date('2026-09-14T12:00:00Z')
const day = 24 * 60 * 60 * 1000

describe('invitation lifecycle', () => {
  it('expires seven days after it is issued', () => {
    const expiry = invitationExpiry(NOW)
    expect(expiry.getTime() - NOW.getTime()).toBe(INVITATION_TTL_DAYS * day)
  })

  it.each([
    ['pending', { acceptedAt: null, revokedAt: null, expiresAt: new Date(NOW.getTime() + day) }],
    ['accepted', { acceptedAt: NOW, revokedAt: null, expiresAt: new Date(NOW.getTime() + day) }],
    ['revoked', { acceptedAt: null, revokedAt: NOW, expiresAt: new Date(NOW.getTime() + day) }],
    ['expired', { acceptedAt: null, revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) }],
  ] as const)('reports %s', (expected, invitation) => {
    expect(invitationState(invitation, NOW)).toBe(expected)
  })

  it('treats revocation as stronger than acceptance', () => {
    // Revoking an already-accepted invitation must not read as still valid.
    expect(invitationState({ acceptedAt: NOW, revokedAt: NOW, expiresAt: NOW }, NOW)).toBe(
      'revoked',
    )
  })

  it('expires exactly on the boundary, not a millisecond later', () => {
    expect(invitationState({ acceptedAt: null, revokedAt: null, expiresAt: NOW }, NOW)).toBe(
      'expired',
    )
  })
})

describe('protecting the last owner', () => {
  /**
   * An organisation with no owner cannot be administered by anyone, and
   * recovering it needs the platform operator. The rule is worth a test.
   */
  it('refuses to demote the last owner', () => {
    expect(
      canChangeRole({ role: 'owner', userId: 'a' }, { role: 'owner', userId: 'b' }, 1),
    ).toEqual({ allowed: false, reason: 'last_owner' })
  })

  it('allows demoting an owner when another remains', () => {
    expect(
      canChangeRole({ role: 'owner', userId: 'a' }, { role: 'owner', userId: 'b' }, 2).allowed,
    ).toBe(true)
  })

  it('refuses to deactivate the last owner', () => {
    expect(canDeactivate({ role: 'owner', userId: 'b' }, 'a', 1)).toEqual({
      allowed: false,
      reason: 'last_owner',
    })
  })

  it('refuses self-deactivation, whatever the role', () => {
    expect(canDeactivate({ role: 'manager', userId: 'a' }, 'a', 3)).toEqual({
      allowed: false,
      reason: 'self',
    })
  })

  it('allows deactivating a colleague', () => {
    expect(canDeactivate({ role: 'collaborator', userId: 'b' }, 'a', 2).allowed).toBe(true)
  })
})

describe('seats', () => {
  it.each([
    [0, 10, true],
    [9, 10, true],
    [10, 10, false],
    [11, 10, false],
  ])('%i active of %i seats -> %s', (active, limit, expected) => {
    expect(hasSeatAvailable(active, limit)).toBe(expected)
  })
})
