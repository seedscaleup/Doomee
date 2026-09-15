import 'server-only'

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
import { serverEnv } from '@/lib/env'
import * as schema from './schema'

/**
 * ============================================================================
 * The ONLY way to reach the database.
 *
 * CLAUDE.md rule 1: no query crosses the organization_id boundary, and the raw
 * pool is never exported. Everything goes through withTenant / withPortal,
 * each of which opens a transaction and pins the tenant context inside it.
 *
 * Why SET LOCAL and not SET: SET LOCAL is transaction-scoped, so the context
 * cannot survive on a pooled connection and leak into the next request (R3).
 * This is what makes the pattern safe behind a transaction-mode pooler.
 * ============================================================================
 */

export type TenantDb = NodePgDatabase<typeof schema>

type ActorKind = 'internal' | 'portal'

const ROLE_BY_ACTOR: Record<ActorKind, 'app_user' | 'app_portal'> = {
  internal: 'app_user',
  portal: 'app_portal',
}

export type TenantContext = {
  organizationId: string
  /** Clients this portal user may see. Required for the portal, ignored otherwise. */
  clientIds?: readonly string[]
  /**
   * Who is acting. Required for the portal, ignored otherwise.
   *
   * The portal's two write policies check it: a client's comment and a
   * client's review decision must be attributed to the session's own user, so
   * the attribution is enforced by the DATABASE and not by whichever value the
   * handler happened to put in the INSERT.
   */
  userId?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let internalPool: Pool | undefined
let portalPool: Pool | undefined

type PoolSettings = { connectionString: string; max?: number }

/**
 * Separate pools per actor kind (ADR-005), so portal traffic can never reuse a
 * connection that is mid-transaction as app_user, and so the portal's capacity
 * is bounded independently of the internal app.
 */
export function configureDatabase(settings: PoolSettings): void {
  const base = {
    connectionString: settings.connectionString,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'doomee',
  }
  internalPool ??= new Pool({ ...base, max: settings.max ?? 10 })
  portalPool ??= new Pool({ ...base, max: settings.max ?? 5, application_name: 'doomee-portal' })
}

export async function closeDatabase(): Promise<void> {
  await Promise.all([internalPool?.end(), portalPool?.end()])
  internalPool = undefined
  portalPool = undefined
}

function poolFor(actor: ActorKind): Pool {
  // Lazily configure from the environment on first use. configureDatabase()
  // stays exported so a test can point the pools at a throwaway container
  // before anything touches them.
  if (!internalPool || !portalPool) {
    configureDatabase({ connectionString: serverEnv().DATABASE_URL })
  }

  const pool = actor === 'portal' ? portalPool : internalPool
  if (!pool) throw new Error('Database not configured')
  return pool
}

async function applyContext(
  client: PoolClient,
  actor: ActorKind,
  context: TenantContext,
): Promise<void> {
  if (!UUID.test(context.organizationId)) {
    throw new Error('withTenant requires a valid organization id')
  }

  // The role name comes from a closed map, never from input.
  await client.query(`SET LOCAL ROLE ${ROLE_BY_ACTOR[actor]}`)

  // set_config(..., true) is the parameterised form of SET LOCAL: the value is
  // bound, so a tenant id can never be interpolated into SQL.
  await client.query('SELECT set_config($1, $2, true)', [
    'app.organization_id',
    context.organizationId,
  ])

  if (actor === 'portal') {
    const clientIds = context.clientIds ?? []
    if (clientIds.length === 0) {
      throw new Error('A portal context requires at least one client id')
    }
    if (!clientIds.every((id) => UUID.test(id))) {
      throw new Error('withPortal received an invalid client id')
    }
    await client.query('SELECT set_config($1, $2, true)', ['app.client_ids', clientIds.join(',')])

    if (!context.userId || !UUID.test(context.userId)) {
      throw new Error('A portal context requires the acting user id')
    }
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', context.userId])
  }
}

async function run<T>(
  actor: ActorKind,
  context: TenantContext,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  const client = await poolFor(actor).connect()

  try {
    await client.query('BEGIN')
    await applyContext(client, actor, context)

    const result = await fn(drizzle(client, { schema }))

    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    // RESET ROLE is belt and braces: COMMIT/ROLLBACK already discards SET LOCAL.
    await client.query('RESET ROLE').catch(() => undefined)
    client.release()
  }
}

/** Internal sessions: owner, direction, manager, collaborator. */
export function withTenant<T>(
  context: TenantContext,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return run('internal', context, fn)
}

/**
 * The ONE query that legitimately spans tenants: which organisations does this
 * person belong to, for the organisation switcher.
 *
 * It opens a transaction with app.lookup_user_id set and app.organization_id
 * deliberately UNSET. Migration 0003 gates the matching policies on exactly
 * that condition, so they are inert inside any normal tenant transaction and
 * cannot be used to widen one.
 *
 * Nothing else may use this. It returns rows the caller owns, never rows an
 * organisation owns.
 */
export async function withUserLookup<T>(
  userId: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) throw new Error('withUserLookup requires a valid user id')

  const client = await poolFor('internal').connect()

  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE app_user')
    await client.query('SELECT set_config($1, $2, true)', ['app.lookup_user_id', userId])

    const result = await fn(drizzle(client, { schema }))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.query('RESET ROLE').catch(() => undefined)
    client.release()
  }
}

/**
 * ============================================================================
 * The SECOND query that legitimately runs without a tenant: resolving a share
 * token to the organisation it belongs to.
 *
 * A share link carries no session — the token IS the authorisation. So the
 * organisation cannot come from a session, and it must not come from the URL
 * either. It comes from the token itself, looked up by a SECURITY DEFINER
 * function that returns the share's METADATA and nothing else: no report
 * title, no content, no sections.
 *
 * Once the organisation is known, the caller opens a normal `withTenant`
 * transaction and reads the report under row level security like everything
 * else. This function is the doorway, never the room.
 *
 * Migration 0018 gates the matching function on `app.share_token_hash` being
 * set, so it is inert inside any ordinary tenant transaction and cannot be
 * used to widen one.
 * ============================================================================
 */
export async function withShareLookup<T>(
  tokenHash: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw new Error('withShareLookup requires a sha-256 hash')
  }

  const client = await poolFor('internal').connect()

  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE app_user')
    await client.query('SELECT set_config($1, $2, true)', ['app.share_token_hash', tokenHash])

    const result = await fn(drizzle(client, { schema }))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.query('RESET ROLE').catch(() => undefined)
    client.release()
  }
}

/** Client portal sessions. Reads the portal.* views only (ADR-026). */
export function withPortal<T>(
  context: TenantContext & { clientIds: readonly string[]; userId: string },
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return run('portal', context, fn)
}
