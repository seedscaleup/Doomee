import type { Locale } from '@/i18n/routing'
import { PERMISSIONS, type Permission, type Role } from './permissions'

/**
 * Who is acting, resolved once per request from the session.
 *
 * Two shapes, deliberately distinct rather than one type with optional fields:
 * an internal member and a client contact are not the same kind of actor, and
 * the type system should refuse to confuse them.
 */
export type InternalActor = {
  kind: 'internal'
  userId: string
  organizationId: string
  role: Exclude<Role, 'client'>
  locale: Locale
  isPlatformAdmin: boolean
  /** Projects the actor is a member of. Empty means "not scoped by membership". */
  projectIds: readonly string[]
}

export type ClientActor = {
  kind: 'client'
  userId: string
  organizationId: string
  role: 'client'
  locale: Locale
  /** The client accounts this contact may see (ADR-023 — there can be several). */
  clientIds: readonly string[]
}

export type Actor = InternalActor | ClientActor

/**
 * The single authorisation predicate. The interface calls it to decide what to
 * show; the server calls it to decide what to allow. Same function, so what is
 * hidden and what is refused can never drift apart.
 *
 * It answers "may this role do this at all". Scope — this project, this client,
 * this row — is a separate question, answered by the callers below and by RLS.
 */
export function can(actor: Actor, permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission]
  return allowed.includes(actor.role)
}

/** A collaborator only sees the projects they belong to (docs §3.3 rule 2). */
export function canReachProject(actor: Actor, projectId: string): boolean {
  if (actor.kind === 'client') return false
  if (actor.role === 'collaborator') return actor.projectIds.includes(projectId)
  return true
}

/** A client contact only sees the client accounts granted to them. */
export function canReachClient(actor: Actor, clientId: string): boolean {
  if (actor.kind === 'client') return actor.clientIds.includes(clientId)
  return can(actor, 'client.read')
}

export function isInternal(actor: Actor): actor is InternalActor {
  return actor.kind === 'internal'
}
