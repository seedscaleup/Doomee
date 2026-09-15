'use server'

import { and, eq, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  clientContacts,
  clientUserAccess,
  invitations,
  memberships,
  organizations,
  subscriptions,
  users,
} from '@/db/schema'
import { type TenantDb, withTenant } from '@/db/tenant'
import { isLocale, type Locale } from '@/i18n/routing'
import { createToken, hashToken, setActiveOrganization } from '@/lib/auth/session-store'
import { serverEnv } from '@/lib/env'
import { AppError } from '@/lib/errors/app-error'
import { mailer } from '@/lib/mail'
import { renderMail } from '@/lib/mail/templates'
import { defineAction, requireSession } from '@/server'
import { type InvitationTarget, invitationByHash } from './invitation-lookup'
import {
  changeRoleSchema,
  deactivateMemberSchema,
  type InviteMemberInput,
  inviteMemberSchema,
} from './schemas'
import {
  canChangeRole,
  canDeactivate,
  hasSeatAvailable,
  invitationExpiry,
  invitationState,
} from './service'

export const inviteMember = defineAction({
  input: inviteMemberSchema,
  permission: 'member.invite',
  handler: async (input: InviteMemberInput, { actor, db, audit }) => {
    const [seats] = await db
      .select({
        limit: subscriptions.seatsLimit,
        active: sql<number>`(
          SELECT count(*)::int FROM memberships m
           WHERE m.organization_id = ${actor.organizationId} AND m.status = 'active'
        )`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, actor.organizationId))
      .limit(1)

    if (seats && !hasSeatAvailable(seats.active, seats.limit)) {
      throw new AppError('conflict', 'errors.seats_exhausted')
    }

    // An existing member is not an error the inviter can act on, so say so
    // plainly rather than failing the form with a generic message.
    const existing = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organizationId, actor.organizationId), eq(users.email, input.email)),
      )
      .limit(1)

    if (existing.length > 0) throw new AppError('conflict', 'errors.already_member')

    const { token, hash } = createToken()
    const now = new Date()

    await db.insert(invitations).values({
      id: uuidv7(),
      organizationId: actor.organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hash,
      expiresAt: invitationExpiry(now),
      invitedBy: actor.userId,
    })

    const [organization] = await db
      .select({ name: organizations.name, defaultLocale: organizations.defaultLocale })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .limit(1)

    const [inviter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1)

    // The invitee has no account yet, so there is no preference to read: fall
    // back to the organisation's default language (ADR-011).
    const locale: Locale = isLocale(organization?.defaultLocale ?? '')
      ? (organization?.defaultLocale as Locale)
      : 'fr'

    await mailer().send(
      renderMail('invitation', {
        to: input.email,
        locale,
        url: `${serverEnv().APP_URL}/${locale}/invitation/${token}`,
        params: {
          organization: organization?.name ?? 'doomee',
          inviter: inviter?.name ?? 'doomee',
        },
      }),
    )

    await audit({
      action: 'member.invited',
      entityType: 'invitation',
      after: { email: input.email, role: input.role },
    })

    return { email: input.email }
  },
})

export const changeMemberRole = defineAction({
  input: changeRoleSchema,
  permission: 'member.change_role',
  handler: async (input, { actor, db, audit }) => {
    const [target] = await db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, actor.organizationId),
          eq(memberships.userId, input.userId),
        ),
      )
      .limit(1)

    if (!target) throw new AppError('not_found', 'errors.not_found')

    const [owners] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.role, 'owner'), eq(memberships.status, 'active')))

    const verdict = canChangeRole(
      { role: actor.role, userId: actor.userId },
      { role: target.role, userId: input.userId },
      owners?.count ?? 0,
    )
    if (!verdict.allowed) throw new AppError('conflict', `errors.${verdict.reason}`)

    await db
      .update(memberships)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(memberships.id, target.id))

    await audit({
      action: 'membership.role_changed',
      entityType: 'membership',
      entityId: target.id,
      before: { role: target.role },
      after: { role: input.role },
    })

    return { userId: input.userId, role: input.role }
  },
})

export const deactivateMember = defineAction({
  input: deactivateMemberSchema,
  permission: 'member.deactivate',
  handler: async (input, { actor, db, audit }) => {
    const [target] = await db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, actor.organizationId),
          eq(memberships.userId, input.userId),
        ),
      )
      .limit(1)

    if (!target) throw new AppError('not_found', 'errors.not_found')

    const [owners] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.role, 'owner'), eq(memberships.status, 'active')))

    const verdict = canDeactivate(
      { role: target.role, userId: input.userId },
      actor.userId,
      owners?.count ?? 0,
    )
    if (!verdict.allowed) throw new AppError('conflict', `errors.${verdict.reason}`)

    await db
      .update(memberships)
      .set({ status: 'suspended', deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(memberships.id, target.id))

    await audit({
      action: 'membership.deactivated',
      entityType: 'membership',
      entityId: target.id,
    })

    return { userId: input.userId }
  },
})

/**
 * Accepting an invitation is another bootstrap case: the accepting user is, by
 * definition, not yet a member, so defineAction cannot resolve an actor.
 *
 * The token is the authorisation. It is compared by hash, single-use, and the
 * organisation comes from the stored row — never from the request.
 */
export async function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  const session = await requireSession()
  const hash = hashToken(token)

  const target = await lookupInvitation(hash)
  const { organizationId, role } = target

  await withTenant({ organizationId }, async (db) => {
    const [invitation] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(eq(invitations.tokenHash, hash))
      .limit(1)

    if (!invitation || invitationState(invitation, new Date()) !== 'pending') {
      throw new AppError('not_found', 'errors.invitation_invalid')
    }

    const existing = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(eq(memberships.organizationId, organizationId), eq(memberships.userId, session.userId)),
      )
      .limit(1)

    if (existing.length === 0) {
      await db.insert(memberships).values({
        id: uuidv7(),
        organizationId,
        userId: session.userId,
        role,
        status: 'active',
        joinedAt: new Date(),
      })
    }

    if (target.role === 'client') {
      await grantClientAccess(db, {
        organizationId,
        clientId: target.clientId,
        userId: session.userId,
        email: invitation.email,
      })
    }

    await db
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: session.userId, updatedAt: new Date() })
      .where(eq(invitations.id, invitation.id))
  })

  /**
   * The active organisation is set for BOTH kinds, and for the same reason: it
   * is what scopes the next request. A client's portal session reads
   * `activeOrganizationId` exactly as an internal one does — without it,
   * `requirePortalActor` finds no organisation and answers 404 to the very
   * person who just accepted the invitation.
   *
   * It does not open the internal workspace to them: `requireActor` refuses a
   * `client` membership outright, and the (app) layout filters those
   * memberships out before it ever renders.
   */
  await setActiveOrganization(session.userId, organizationId)

  return { organizationId, kind: target.role === 'client' ? 'client' : 'internal' }
}

export type AcceptedInvitation = {
  organizationId: string
  kind: 'internal' | 'client'
}

/**
 * Opens ONE client account to a portal user, and links the contact row to the
 * account that now answers for it.
 *
 * Both writes are additive on purpose (ADR-023). The same person is a
 * legitimate contact of several client accounts, and of several organisations:
 * a second invitation must add a second access, never replace the first and
 * never fail on a uniqueness rule that was written for a simpler world.
 */
async function grantClientAccess(
  db: TenantDb,
  scope: { organizationId: string; clientId: string; userId: string; email: string },
): Promise<void> {
  await db
    .insert(clientUserAccess)
    .values({
      id: uuidv7(),
      organizationId: scope.organizationId,
      clientId: scope.clientId,
      userId: scope.userId,
      grantedBy: null,
    })
    // Accepting the same invitation twice, or holding access already, is not an
    // error worth showing anyone.
    .onConflictDoNothing()

  await db
    .update(clientContacts)
    .set({ userId: scope.userId, updatedAt: new Date() })
    .where(
      and(
        eq(clientContacts.organizationId, scope.organizationId),
        eq(clientContacts.clientId, scope.clientId),
        eq(clientContacts.email, scope.email),
      ),
    )
}

/**
 * Finds which organisation a token belongs to, without a tenant context.
 *
 * Runs on the auth connection because the lookup is, by nature, pre-tenant. It
 * matches on the HASH of a 256-bit token, so it cannot be enumerated, and it
 * returns nothing but the organisation and role the token already encodes.
 */
async function lookupInvitation(hash: string): Promise<InvitationTarget> {
  const found = await invitationByHash(hash)
  if (!found) throw new AppError('not_found', 'errors.invitation_invalid')
  return found
}
