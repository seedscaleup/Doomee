'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { clientContacts, clients, invitations, organizations, users } from '@/db/schema'
import { isLocale, type Locale } from '@/i18n/routing'
import { createToken } from '@/lib/auth/session-store'
import { serverEnv } from '@/lib/env'
import { AppError } from '@/lib/errors/app-error'
import { mailer } from '@/lib/mail'
import { renderMail } from '@/lib/mail/templates'
import { recordActivity } from '@/modules/activity'
import { invitationExpiry } from '@/modules/members'
import { slugify } from '@/modules/organizations'
import { defineAction } from '@/server'
import {
  archiveClientSchema,
  type CreateClientInput,
  createClientSchema,
  inviteClientContactSchema,
  inviteContactToPortalSchema,
  updateClientSchema,
} from './schemas'
import { canTransition } from './service'

const MAX_SLUG_ATTEMPTS = 5

/**
 * The twenty-odd optional fields of the form, turned into a row.
 *
 * Kept out of the action because the retry loop around it is the only thing
 * worth reading there: an empty string is not an address, and `undefined` is
 * not NULL, and that translation should not be interleaved with the reason the
 * insert may run five times.
 */
function newClientRow(
  input: CreateClientInput,
  actor: { organizationId: string; userId: string },
  id: string,
  slug: string,
) {
  const orNull = (value: string | undefined) => (value && value.length > 0 ? value : null)

  return {
    id,
    organizationId: actor.organizationId,
    name: input.name,
    slug,
    industryId: input.industryId ?? null,
    description: orNull(input.description),
    website: orNull(input.website),
    email: orNull(input.email),
    phone: orNull(input.phone),
    address: orNull(input.address),
    status: input.status,
    ownerUserId: input.ownerUserId ?? actor.userId,
    accountTeamNote: orNull(input.accountTeamNote),
    createdBy: actor.userId,
    updatedBy: actor.userId,
  }
}

export const createClient = defineAction({
  input: createClientSchema,
  permission: 'client.create',
  handler: async (input, { actor, db, audit }) => {
    const base = slugify(input.name) || 'client'

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const id = uuidv7()
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`

      try {
        await db.insert(clients).values(newClientRow(input, actor, id, slug))

        await recordActivity(db, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          verb: 'client.created',
          entityType: 'client',
          entityId: id,
          clientId: id,
          params: { name: input.name },
        })

        await audit({
          action: 'client.created',
          entityType: 'client',
          entityId: id,
          after: { name: input.name, status: input.status },
        })

        return { id, slug }
      } catch (error) {
        if (isSlugConflict(error)) continue
        throw error
      }
    }

    throw new AppError('conflict', 'errors.slug_taken')
  },
})

export const updateClient = defineAction({
  input: updateClientSchema,
  permission: 'client.update',
  handler: async (input, { actor, db, audit }) => {
    const { id, ...changes } = input

    const [existing] = await db
      .select({ status: clients.status, name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    if (changes.status && !canTransition(existing.status, changes.status)) {
      throw new AppError('conflict', 'errors.invalid_transition')
    }

    await db
      .update(clients)
      .set({ ...changes, updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(clients.id, id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'client.updated',
      entityType: 'client',
      entityId: id,
      clientId: id,
      params: { name: changes.name ?? existing.name },
    })

    await audit({
      action: 'client.updated',
      entityType: 'client',
      entityId: id,
      before: { status: existing.status },
      after: changes,
    })

    return { id }
  },
})

export const archiveClient = defineAction({
  input: archiveClientSchema,
  permission: 'client.archive',
  handler: async (input, { actor, db, audit }) => {
    const [existing] = await db
      .select({ status: clients.status, name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, input.id), isNull(clients.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    await db
      .update(clients)
      .set({ status: 'archived', updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(clients.id, input.id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'client.archived',
      entityType: 'client',
      entityId: input.id,
      clientId: input.id,
      params: { name: existing.name },
    })

    await audit({ action: 'client.archived', entityType: 'client', entityId: input.id })

    return { id: input.id }
  },
})

/**
 * Adds a contact to a client. Inviting them to the portal is a separate,
 * deliberate act — see inviteContactToPortal below: recording who to talk to
 * and granting access to the product are not the same decision.
 */
export const addClientContact = defineAction({
  input: inviteClientContactSchema,
  permission: 'client.invite_contact',
  handler: async (input, { actor, db, audit }) => {
    const [client] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
      .limit(1)

    if (!client) throw new AppError('not_found', 'errors.not_found')

    // Only one primary contact per client: demote the previous one first.
    if (input.isPrimary) {
      await db
        .update(clientContacts)
        .set({ isPrimary: false })
        .where(eq(clientContacts.clientId, input.clientId))
    }

    const id = uuidv7()

    try {
      await db.insert(clientContacts).values({
        id,
        organizationId: actor.organizationId,
        clientId: input.clientId,
        name: input.name,
        email: input.email,
        jobTitle: input.jobTitle ?? null,
        isPrimary: input.isPrimary,
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('conflict', 'errors.contact_exists')
      throw error
    }

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'client.contact_added',
      entityType: 'client',
      entityId: input.clientId,
      clientId: input.clientId,
      params: { name: input.name },
    })

    await audit({
      action: 'client.contact_added',
      entityType: 'client',
      entityId: input.clientId,
      after: { email: input.email },
    })

    return { id }
  },
})

function driverError(error: unknown): { code?: string; constraint?: string } | undefined {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
  return cause as { code?: string; constraint?: string } | undefined
}

function isSlugConflict(error: unknown): boolean {
  const driver = driverError(error)
  return driver?.code === '23505' && driver.constraint?.includes('slug') === true
}

function isUniqueViolation(error: unknown): boolean {
  return driverError(error)?.code === '23505'
}

/**
 * Opens the portal to a contact already on file.
 *
 * The invitation names the client account it opens, and nothing else. What the
 * holder of the token can eventually see is decided by client_user_access at
 * acceptance, not by the token — so a forwarded link grants the same single
 * account, never more.
 *
 * A contact who already has an account is NOT an error (ADR-023): the same
 * person legitimately follows several client accounts, and several
 * organisations. They receive a second invitation and end up with a second
 * access, which is the intended outcome, not a collision to report.
 */
export const inviteContactToPortal = defineAction({
  input: inviteContactToPortalSchema,
  permission: 'client.invite_contact',
  handler: async (input, { actor, db, audit }) => {
    const [contact] = await db
      .select({
        id: clientContacts.id,
        email: clientContacts.email,
        name: clientContacts.name,
        clientId: clientContacts.clientId,
        userId: clientContacts.userId,
        clientName: clients.name,
      })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(eq(clientContacts.id, input.contactId), isNull(clientContacts.deletedAt)))
      .limit(1)

    if (!contact) throw new AppError('not_found', 'errors.not_found')
    if (contact.userId) throw new AppError('conflict', 'errors.already_member')

    const { token, hash } = createToken()

    await db.insert(invitations).values({
      id: uuidv7(),
      organizationId: actor.organizationId,
      clientId: contact.clientId,
      email: contact.email,
      role: 'client',
      tokenHash: hash,
      expiresAt: invitationExpiry(new Date()),
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

    // No account yet, so no users.locale to read: the organisation's default
    // language is the best guess available, passed explicitly (ADR-011).
    const locale: Locale = isLocale(organization?.defaultLocale ?? '')
      ? (organization?.defaultLocale as Locale)
      : 'fr'

    await mailer().send(
      renderMail('portalInvitation', {
        to: contact.email,
        locale,
        url: `${serverEnv().APP_URL}/${locale}/invitation/${token}`,
        params: {
          organization: organization?.name ?? 'doomee',
          inviter: inviter?.name ?? 'doomee',
          client: contact.clientName,
        },
      }),
    )

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'client.contact_invited',
      entityType: 'client',
      entityId: contact.clientId,
      clientId: contact.clientId,
      params: { name: contact.name },
    })

    await audit({
      action: 'client.contact_invited',
      entityType: 'client_contact',
      entityId: contact.id,
      after: { email: contact.email, clientId: contact.clientId },
    })

    return { email: contact.email }
  },
})
