import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
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
  const pool = actor === 'portal' ? portalPool : internalPool
  if (!pool) throw new Error('Database not configured. Call configureDatabase() first.')
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

/** Client portal sessions. Reads the portal.* views only (ADR-026). */
export function withPortal<T>(
  context: TenantContext & { clientIds: readonly string[] },
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return run('portal', context, fn)
}
