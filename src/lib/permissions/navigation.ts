import { type Actor, can } from './actor'
import type { Permission } from './permissions'

/**
 * The menu is DERIVED from permissions, never hard-coded per role
 * (docs/cahier-des-charges.md §3.4).
 *
 * Two reasons this matters beyond tidiness: a role gaining a permission gets
 * the menu entry without anyone remembering to add it, and the interface can
 * never offer something the server would then refuse — it asks the same
 * can() the gateway asks.
 *
 * Hiding is not security. A hidden entry is a courtesy; the refusal happens in
 * defineQuery / defineAction and, underneath, in row level security.
 */
export type NavKey =
  | 'home'
  | 'myWork'
  | 'projects'
  | 'actions'
  | 'results'
  | 'insights'
  | 'reports'
  | 'clients'
  | 'deliverables'
  | 'team'
  | 'calendar'
  | 'settings'

export type NavEntry = {
  key: NavKey
  href: string
  /** Undefined means "everyone signed in": Home and Settings are unconditional. */
  permission?: Permission
  /** Shown in the phone bottom bar, which only has room for a few. */
  primary?: boolean
  /**
   * Declared, permission-mapped and tested, but its route does not exist yet.
   * Kept here so the whole menu of docs/cahier-des-charges.md §3.4 is reviewed
   * once rather than assembled piecemeal; filtered out of what is rendered so
   * nobody is offered a 404. Each lot deletes one of these lines.
   */
  planned?: true
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { key: 'home', href: '/app', primary: true },
  { key: 'myWork', href: '/app/my-work', permission: 'action.read', primary: true },
  { key: 'projects', href: '/app/projects', permission: 'project.read', primary: true },
  { key: 'actions', href: '/app/actions', permission: 'action.read' },
  { key: 'clients', href: '/app/clients', permission: 'client.create' },
  { key: 'deliverables', href: '/app/deliverables', permission: 'deliverable.read' },
  { key: 'results', href: '/app/results', permission: 'result.read' },
  { key: 'insights', href: '/app/insights', permission: 'insight.read' },
  { key: 'reports', href: '/app/reports', permission: 'report.read', planned: true },
  { key: 'calendar', href: '/app/calendar', permission: 'action.read', planned: true },
  { key: 'team', href: '/app/team', permission: 'member.read' },
  { key: 'settings', href: '/app/settings', primary: true },
]

/**
 * A client contact gets NOTHING from this menu.
 *
 * Filtering on permissions alone is not enough: a client legitimately holds
 * `action.read` and `project.read` for what is shared with them, so a naive
 * filter would hand them My Work, Projects and Calendar — the shape of the
 * internal workspace. They reach the product through the portal (LOT 9), which
 * has its own shell and its own, narrower menu.
 */
export function navigationFor(actor: Actor): NavEntry[] {
  if (actor.kind === 'client') return []
  return NAV_ENTRIES.filter(
    (entry) => !entry.planned && (!entry.permission || can(actor, entry.permission)),
  )
}

/** The full declared menu, planned entries included. For tests and for docs. */
export function permittedEntries(actor: Actor): NavEntry[] {
  if (actor.kind === 'client') return []
  return NAV_ENTRIES.filter((entry) => !entry.permission || can(actor, entry.permission))
}

/** The phone bottom bar: at most four, so each target stays comfortably wide. */
export function primaryNavigationFor(actor: Actor): NavEntry[] {
  return navigationFor(actor)
    .filter((entry) => entry.primary)
    .slice(0, 4)
}
