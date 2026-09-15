import 'server-only'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientUserAccess, memberships, users } from '@/db/schema'
import { withTenant, withUserLookup } from '@/db/tenant'
import { isLocale } from '@/i18n/routing'
import { auth } from '@/lib/auth/config'
import { setActiveOrganization } from '@/lib/auth/session-store'
import { AppError } from '@/lib/errors/app-error'
import type { Actor, ClientActor } from '@/lib/permissions'

/**
 * Resolves WHO is acting and WHICH tenant they are acting in.
 *
 * The organisation comes from the session, never from the URL or a request
 * parameter (docs/architecture.md §6.2): an organisation id a user can type is
 * an organisation id a user can change.
 *
 * This runs in the Node server layer, not in middleware — middleware-based
 * authorisation is bypassable, so it only does locale routing (D1).
 */
export type Session = {
  userId: string
  activeOrganizationId: string | null
}

export async function getSession(): Promise<Session | null> {
  // headers() FIRST, deliberately. During static generation it throws the
  // bail-out Next uses to mark a route dynamic; resolving auth() before it
  // would hit environment validation during `next build` instead, and fail the
  // build for a page that is inherently per-request anyway.
  const requestHeaders = await headers()
  const result = await auth().api.getSession({ headers: requestHeaders })
  if (!result?.session) return null

  const active = (result.session as { activeOrganizationId?: string | null }).activeOrganizationId

  return { userId: result.session.userId, activeOrganizationId: active ?? null }
}

/**
 * For pages: an anonymous visitor gets sent to sign-in, not a 500.
 *
 * Layouts and pages render in parallel in the App Router, so a page that throws
 * on a missing session can lose the race against its layout's redirect. Pages
 * call this; server actions call requireSession, where throwing is correct.
 */
export async function requirePageSession(locale: string): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/${locale}/sign-in`)
  return session
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new AppError('unauthenticated', 'errors.unauthenticated')
  return session
}

/**
 * The actor for the active organisation.
 *
 * Membership is read through withTenant, so even this lookup is subject to row
 * level security: a session pointing at an organisation the user does not
 * belong to resolves to nothing, not to a partial actor.
 */
export async function requireActor(): Promise<Actor> {
  const session = await requireSession()

  if (!session.activeOrganizationId) {
    throw new AppError('forbidden', 'errors.no_active_organization')
  }

  const organizationId = session.activeOrganizationId

  const rows = await withTenant({ organizationId }, (db) =>
    db
      .select({
        role: memberships.role,
        status: memberships.status,
        locale: users.locale,
        isPlatformAdmin: users.isPlatformAdmin,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organizationId, organizationId), eq(memberships.userId, session.userId)),
      )
      .limit(1),
  )

  const membership = rows[0]
  if (membership?.status !== 'active') {
    // 404-shaped, not 403: never confirm that an organisation exists.
    throw new AppError('not_found', 'errors.not_found')
  }

  const locale = isLocale(membership.locale) ? membership.locale : 'fr'

  if (membership.role === 'client') {
    // Client contacts reach the product through the portal, which resolves its
    // own actor with the client ids it is allowed to see (LOT 9).
    throw new AppError('not_found', 'errors.not_found')
  }

  return {
    kind: 'internal',
    userId: session.userId,
    organizationId,
    role: membership.role,
    locale,
    isPlatformAdmin: membership.isPlatformAdmin,
    projectIds: [],
  }
}

/**
 * ============================================================================
 * The PORTAL actor.
 *
 * A client contact is not an internal member with fewer rights — it is a
 * different kind of actor, and `requireActor` refuses one outright. This is
 * the only door into the portal.
 *
 * The client ids come from `client_user_access`, read inside a tenant
 * transaction so the lookup is itself subject to row level security. They then
 * become the portal transaction's scope: whatever this returns is exactly what
 * the database will let the session see (ADR-023 — there can be several).
 * ============================================================================
 */
export async function requirePortalActor(): Promise<ClientActor> {
  const session = await requireSession()

  /**
   * A session with no active organisation is REPAIRED here, not refused.
   *
   * Accepting an invitation sets the active organisation on the session that
   * accepted it. Every later sign-in — another device, an expired cookie —
   * creates a new session row with none, and the portal then answered 404 to a
   * client whose access was perfectly valid. Permanently, because an
   * invitation link is one-shot.
   *
   * The repair lives HERE rather than in the portal layout because layouts and
   * pages render in PARALLEL: a layout that healed the session would still lose
   * the race against the page's own query. This is the one place every portal
   * read passes through, so it is the only place the repair can be complete.
   *
   * It widens nothing. The organisation still comes from the user's own
   * membership rows, never from the URL, and every check below still runs.
   */
  const organizationId =
    session.activeOrganizationId ?? (await adoptClientOrganization(session.userId))

  if (!organizationId) {
    throw new AppError('not_found', 'errors.not_found')
  }

  const rows = await withTenant({ organizationId }, async (db) => {
    const membership = await db
      .select({ role: memberships.role, status: memberships.status, locale: users.locale })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organizationId, organizationId), eq(memberships.userId, session.userId)),
      )
      .limit(1)

    // Sequential: one transaction, one connection, one query at a time
    // (ADR-044).
    const access = await db
      .select({ clientId: clientUserAccess.clientId })
      .from(clientUserAccess)
      .where(eq(clientUserAccess.userId, session.userId))

    return { membership: membership[0], access }
  })

  // 404-shaped throughout. An internal member reaching a portal URL, and a
  // client whose access was revoked, get the same answer as a stranger: never
  // confirm what exists.
  if (rows.membership?.status !== 'active') throw new AppError('not_found', 'errors.not_found')
  if (rows.membership.role !== 'client') throw new AppError('not_found', 'errors.not_found')

  const clientIds = rows.access.map((row) => row.clientId)
  // A contact with no client account has nothing to be shown. Letting them
  // through with an empty scope would open a portal transaction that the
  // database refuses anyway — failing here says what is actually wrong.
  if (clientIds.length === 0) throw new AppError('not_found', 'errors.not_found')

  return {
    kind: 'client',
    userId: session.userId,
    organizationId,
    role: 'client',
    locale: isLocale(rows.membership.locale) ? rows.membership.locale : 'fr',
    clientIds,
  }
}

/**
 * The organisation a client contact belongs to, when their session does not
 * say. Written back to the session so the next request costs nothing.
 *
 * Only `client` memberships: the same person may be internal at their own
 * agency and a client contact at another (ADR-023), and adopting the wrong one
 * would put them in the wrong place.
 */
async function adoptClientOrganization(userId: string): Promise<string | null> {
  const rows = await withUserLookup(userId, (db) =>
    db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          eq(memberships.role, 'client'),
        ),
      )
      .orderBy(memberships.organizationId)
      .limit(1),
  )

  const organizationId = rows[0]?.organizationId
  if (!organizationId) return null

  // Re-checks the membership itself, so this is a persistence step and not a
  // second grant.
  await setActiveOrganization(userId, organizationId)
  return organizationId
}

/** For portal pages: an anonymous visitor is sent to sign-in, not to a 500. */
export async function requirePortalPageSession(locale: string): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/${locale}/sign-in`)
  return session
}
