import 'server-only'

import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clientContacts, clients, files, industries, users } from '@/db/schema'
import { MAX_SIGNED_URL_TTL_SECONDS, storage } from '@/lib/storage'
import { defineQuery } from '@/server'
import { listClientsSchema } from './schemas'

import type { ClientRow } from './types'

export type { ClientRow }

export const listClients = defineQuery({
  input: listClientsSchema,
  permission: 'client.read',
  handler: async (input, { db }) => {
    const filters = [isNull(clients.deletedAt)]

    if (input.status) filters.push(eq(clients.status, input.status))

    if (input.search) {
      // unaccent so "cote" finds "Côte d'Ivoire" — in French, requiring the
      // right accent is requiring the search to fail.
      const needle = `%${input.search}%`
      const match = or(
        sql`unaccent(${clients.name}) ILIKE unaccent(${needle})`,
        ilike(clients.email, needle),
      )
      if (match) filters.push(match)
    }

    return db
      .select({
        id: clients.id,
        name: clients.name,
        slug: clients.slug,
        status: clients.status,
        industryLabels: industries.labels,
        ownerName: users.name,
        contactCount: sql<number>`(
          SELECT count(*)::int FROM client_contacts c
           WHERE c.client_id = ${clients.id} AND c.deleted_at IS NULL
        )`,
      })
      .from(clients)
      .leftJoin(industries, eq(industries.id, clients.industryId))
      .leftJoin(users, eq(users.id, clients.ownerUserId))
      .where(and(...filters))
      .orderBy(asc(clients.name))
      .limit(200)
  },
})

export const getClient = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'client.read',
  handler: async (input, { db }) => {
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        slug: clients.slug,
        status: clients.status,
        description: clients.description,
        website: clients.website,
        email: clients.email,
        phone: clients.phone,
        address: clients.address,
        industryId: clients.industryId,
        industryLabels: industries.labels,
        ownerUserId: clients.ownerUserId,
        ownerName: users.name,
        accountTeamNote: clients.accountTeamNote,
        logoKey: files.storageKey,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .leftJoin(industries, eq(industries.id, clients.industryId))
      .leftJoin(users, eq(users.id, clients.ownerUserId))
      .leftJoin(files, eq(files.id, clients.logoFileId))
      .where(and(eq(clients.id, input.id), isNull(clients.deletedAt)))
      .limit(1)

    const client = rows[0]
    if (!client) return null

    const { logoKey, ...rest } = client

    /**
     * The link is minted HERE, after the permission check and inside the tenant
     * transaction that proved the row is ours — and it expires (R13). The
     * storage key itself never leaves the server: it is opaque, but an opaque
     * key that is handed out is still a key.
     */
    return {
      ...rest,
      logoUrl: logoKey ? await storage().signedUrl(logoKey, MAX_SIGNED_URL_TTL_SECONDS) : null,
    }
  },
})

export const listClientContacts = defineQuery({
  input: z.object({ clientId: z.uuid() }),
  permission: 'client.read',
  handler: async (input, { db }) => {
    return db
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        email: clientContacts.email,
        jobTitle: clientContacts.jobTitle,
        isPrimary: clientContacts.isPrimary,
        /** Non-null once the contact has accepted their portal invitation. */
        userId: clientContacts.userId,
      })
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, input.clientId), isNull(clientContacts.deletedAt)))
      .orderBy(asc(clientContacts.name))
  },
})

/** System sectors plus this organisation's own, for the client form. */
export const listIndustries = defineQuery({
  permission: 'taxonomy.read',
  handler: async (_input: undefined, { db }) => {
    return db
      .select({ id: industries.id, code: industries.code, labels: industries.labels })
      .from(industries)
      .where(eq(industries.isActive, true))
      .orderBy(asc(industries.sortOrder), asc(industries.code))
  },
})
