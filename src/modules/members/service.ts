/**
 * Pure membership rules. No database, no clock injection surprises: the current
 * time is always an argument, so every case is reproducible in a test.
 */
import type { Role } from '@/lib/permissions'

export const INVITATION_TTL_DAYS = 7

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired'

export function invitationState(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationState {
  if (invitation.revokedAt) return 'revoked'
  if (invitation.acceptedAt) return 'accepted'
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

/**
 * An organisation must never lose its last owner: a tenant nobody can
 * administer is unrecoverable without operator intervention.
 */
export function canChangeRole(
  current: { role: Role; userId: string },
  target: { role: Role; userId: string },
  ownerCount: number,
): { allowed: boolean; reason?: 'last_owner' | 'self_demotion' } {
  if (target.role === 'owner' && ownerCount <= 1) {
    return { allowed: false, reason: 'last_owner' }
  }
  if (current.userId === target.userId && current.role === 'owner' && ownerCount <= 1) {
    return { allowed: false, reason: 'self_demotion' }
  }
  return { allowed: true }
}

export function canDeactivate(
  target: { role: Role; userId: string },
  actorUserId: string,
  ownerCount: number,
): { allowed: boolean; reason?: 'last_owner' | 'self' } {
  if (target.userId === actorUserId) return { allowed: false, reason: 'self' }
  if (target.role === 'owner' && ownerCount <= 1) return { allowed: false, reason: 'last_owner' }
  return { allowed: true }
}

/** Seats are a commercial limit, so the check is explicit and testable. */
export function hasSeatAvailable(activeMembers: number, seatsLimit: number): boolean {
  return activeMembers < seatsLimit
}
