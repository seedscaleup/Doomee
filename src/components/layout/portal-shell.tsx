'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export type PortalNavItem = { key: string; href: string; label: string }
export type PortalAccount = { id: string; name: string }

/**
 * The client portal's shell.
 *
 * Mobile FIRST, and not as a slogan: a client opens this on a phone, between
 * two other things, to answer one question — "is there anything waiting for
 * me?" (CLAUDE.md rule 9). So the navigation is a bottom bar at phone width
 * and a rail above it, every target is at least 44px, and nothing scrolls
 * sideways (ADR-049).
 *
 * It is a SEPARATE component from AppShell rather than a variant of it. The
 * two look alike today and answer to different masters: this one must never
 * gain an organisation switcher, a command palette over internal entities, or
 * any of the internal shell's future affordances by inheritance.
 */
export function PortalShell({
  accounts,
  activeAccountId,
  items,
  labels,
  children,
}: {
  accounts: readonly PortalAccount[]
  activeAccountId: string
  items: readonly PortalNavItem[]
  labels: { shellLabel: string; switchAccount: string; title: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:hidden">
        <span className="font-semibold">{labels.title}</span>
        {accounts.length > 1 ? (
          <AccountSwitcher
            accounts={accounts}
            activeAccountId={activeAccountId}
            label={labels.switchAccount}
          />
        ) : null}
      </header>

      {/* The rail, from `sm` up. */}
      <nav
        aria-label={labels.shellLabel}
        className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3 sm:flex"
      >
        <span className="px-3 pb-2 font-semibold">{labels.title}</span>
        {accounts.length > 1 ? (
          <div className="px-1 pb-2">
            <AccountSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              label={labels.switchAccount}
            />
          </div>
        ) : null}
        {items.map((item) => (
          <NavLink key={item.key} item={item} pathname={pathname} />
        ))}
      </nav>

      <main className="flex-1 px-4 py-6 pb-24 sm:px-8 sm:pb-8">{children}</main>

      {/* The bottom bar, on phones. Six entries would crowd; five fit. */}
      <nav
        aria-label={labels.shellLabel}
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-surface sm:hidden"
      >
        {items.slice(0, 5).map((item) => (
          <BottomLink key={item.key} item={item} pathname={pathname} />
        ))}
      </nav>
    </div>
  )
}

/**
 * One contact can cover several client accounts, and several organisations
 * (ADR-023). The switcher is a plain link per account: the portal's scope
 * comes from the session, so changing it is a navigation, not a form.
 */
function AccountSwitcher({
  accounts,
  activeAccountId,
  label,
}: {
  accounts: readonly PortalAccount[]
  activeAccountId: string
  label: string
}) {
  const active = accounts.find((account) => account.id === activeAccountId)

  return (
    <details className="relative">
      <summary className="flex min-h-touch cursor-pointer list-none items-center rounded-doomee border border-border px-3 text-label">
        <span className="sr-only">{label}</span>
        {active?.name ?? label}
      </summary>
      <ul className="absolute z-10 mt-1 flex w-56 flex-col rounded-doomee border border-border bg-surface p-1 shadow-sm">
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/portal?account=${account.id}` as '/portal'}
              className="flex min-h-touch items-center rounded-doomee px-3 text-label hover:bg-background"
            >
              {account.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal'
  return pathname.startsWith(href)
}

function NavLink({ item, pathname }: { item: PortalNavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  return (
    <Link
      href={item.href as '/portal'}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-touch items-center rounded-doomee px-3 text-label font-medium',
        active ? 'bg-doomee-yellow text-doomee-black' : 'hover:bg-background',
      )}
    >
      {item.label}
    </Link>
  )
}

function BottomLink({ item, pathname }: { item: PortalNavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  return (
    <Link
      href={item.href as '/portal'}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-touch flex-col items-center justify-center gap-0.5 px-1 py-2 text-caption',
        active ? 'font-semibold text-doomee-black' : 'text-muted',
      )}
    >
      {/* A yellow dot, not a yellow block: one dominant yellow per screen. */}
      <span
        aria-hidden="true"
        className={cn('h-1 w-6 rounded-full', active ? 'bg-doomee-yellow' : 'bg-transparent')}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}
