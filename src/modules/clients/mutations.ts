'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { clientContacts, clients } from '@/db/schema'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { slugify } from '@/modules/organizations'
import { defineAction } from '@/server'
import {
  archiveClientSchema,
  createClientSchema,
  inviteClientContactSchema,
  updateClientSchema,
} from './schemas'
import { canTransition } from './service'

const MAX_SLUG_ATTEMPTS = 5

export const createClient = defineAction({
  input: createClientSchema,
  permission: 'client.create',
  handler: async (input, { actor, db, audit }) => {
    const base = slugify(input.name) || 'client'

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const id = uuidv7()
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`

      try {
        await db.insert(clients).values({
          id,
          organizationId: actor.organizationId,
          name: input.name,
          slug,
          industryId: input.industryId ?? null,
          description: input.description ?? null,
          website: input.website ?? null,
          email: input.email && input.email.length > 0 ? input.email : null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          status: input.status,
          ownerUserId: input.ownerUserId ?? actor.userId,
          accountTeamNote: input.accountTeamNote ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })

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
 * deliberate act (LOT 9): recording who to talk to and granting access to the
 * product are not the same decision.
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
