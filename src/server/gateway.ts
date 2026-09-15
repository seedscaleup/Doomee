import 'server-only'

import { uuidv7 } from 'uuidv7'
import type { z } from 'zod'
import { auditLogs } from '@/db/schema'
import { type TenantDb, withTenant } from '@/db/tenant'
import { AppError, isAppError } from '@/lib/errors/app-error'
import { logger } from '@/lib/logger'
import { type Actor, can, type Permission } from '@/lib/permissions'
import { requireActor } from './context'

/**
 * ============================================================================
 * The mandatory gateway. CLAUDE.md rule 4: every write goes through
 * defineAction, every read through defineQuery, and there is no other path.
 *
 * Both run the same sequence, in this order:
 *   1. resolve the actor      (session -> membership -> role)
 *   2. check the permission   (the typed matrix, never an inline role check)
 *   3. validate the input     (Zod, at the boundary)
 *   4. open a tenant transaction with SET LOCAL app.organization_id
 *   5. run the handler
 *   6. (writes only) record the audit entry in the SAME transaction
 *
 * Step 6 sharing the transaction is deliberate: an action that commits without
 * its audit trail, or an audit entry for a change that rolled back, would both
 * make the log a liar.
 * ============================================================================
 */

export type HandlerContext<A extends Actor = Actor> = {
  actor: A
  db: TenantDb
  /** Records a business event. Written inside the caller's transaction. */
  audit: (entry: AuditEntry) => Promise<void>
}

export type AuditEntry = {
  action: string
  entityType?: string
  entityId?: string
  before?: unknown
  after?: unknown
}

/**
 * `TRaw` is what a CALLER passes; `TParsed` is what the handler receives.
 *
 * They differ whenever the schema does work — `.default()`, `.transform()`,
 * `z.coerce`. Collapsing them into one type looks tidier and is wrong in a way
 * that shows up at the call site: a schema with `includeArchived: z.boolean()
 * .default(false)` would force every caller to pass the very field the default
 * exists to fill.
 */
type Definition<TRaw, TParsed, TOutput> = {
  /** Zod schema for the input, or undefined for a no-argument call. */
  input?: z.ZodType<TParsed, TRaw>
  permission: Permission
  handler: (input: TParsed, context: HandlerContext) => Promise<TOutput>
}

function auditWriter(db: TenantDb, actor: Actor) {
  return async (entry: AuditEntry): Promise<void> => {
    await db.insert(auditLogs).values({
      id: uuidv7(),
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
  }
}

async function authorize(permission: Permission): Promise<Actor> {
  const actor = await requireActor()

  if (!can(actor, permission)) {
    // Deliberately not 403: confirming that something exists but is off-limits
    // is itself a disclosure (docs/architecture.md §6.3).
    throw new AppError('not_found', 'errors.not_found')
  }

  return actor
}

function parseInput<TRaw, TParsed>(
  definition: Definition<TRaw, TParsed, unknown>,
  raw: unknown,
): TParsed {
  if (!definition.input) return raw as TParsed

  const parsed = definition.input.safeParse(raw)
  if (!parsed.success) {
    throw new AppError('validation_failed', 'errors.validation_failed', {
      issues: parsed.error.issues.length,
    })
  }
  return parsed.data
}

/** Reads. No audit entry: reading is not an event, and logging every read would drown the log. */
export function defineQuery<TRaw, TParsed, TOutput>(
  definition: Definition<TRaw, TParsed, TOutput>,
) {
  return async (raw?: TRaw): Promise<TOutput> => {
    const actor = await authorize(definition.permission)
    const input = parseInput(definition, raw)

    return withTenant({ organizationId: actor.organizationId }, (db) =>
      definition.handler(input, { actor, db, audit: auditWriter(db, actor) }),
    )
  }
}

/** Writes. Runs in a transaction, with the audit entry committed alongside. */
export function defineAction<TRaw, TParsed, TOutput>(
  definition: Definition<TRaw, TParsed, TOutput>,
) {
  return async (raw?: TRaw): Promise<TOutput> => {
    const actor = await authorize(definition.permission)
    const input = parseInput(definition, raw)

    try {
      return await withTenant({ organizationId: actor.organizationId }, (db) =>
        definition.handler(input, { actor, db, audit: auditWriter(db, actor) }),
      )
    } catch (error) {
      if (isAppError(error)) throw error

      // Never surface a driver message to a user: it can leak table and column
      // names. Log it in full, return a translated generic failure.
      logger.error(
        { err: error, permission: definition.permission, organizationId: actor.organizationId },
        'action failed',
      )
      throw new AppError('internal', 'errors.internal')
    }
  }
}
