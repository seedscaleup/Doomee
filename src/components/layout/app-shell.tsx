'use client'

import { useState, useTransition } from 'react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { switchOrganization } from '@/modules/organizations/switch-action'
import { CommandPalette } from './command-palette'
import type { ShellNavItem } from './nav-item'

export type OrganizationChoice = { organizationId: string; name: string }

/**
 * The internal shell: a side rail from `sm` up, a bottom bar on phones.
 *
 * The menu arrives already filtered by permissions (navigationFor) — this
 * component never decides who sees what, it only draws it.
 */
export function AppShell({
  organizations,
  activeOrganizationId,
  items,
  labels,
  children,
}: {
  organizations: OrganizationChoice[]
  activeOrganizationId: string
  items: readonly ShellNavItem[]
  labels: {
    mainNavigation: string
    switchOrganization: string
    commandPalette: string
    commandPaletteHint: string
    noResults: string
  }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [current, setCurrent] = useState(activeOrganizationId)

  const primary = items.filter((item) => item.primary).slice(0, 4)

  function onSwitch(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    setCurrent(next)
    startTransition(async () => {
      await switchOrganization({ organizationId: next })
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:hidden">
        <OrganizationPicker
          organizations={organizations}
          value={current}
          onChange={onSwitch}
          label={labels.switchOrganization}
          disabled={pending}
        />
        <CommandPalette
          items={items}
          label={labels.commandPalette}
          hint={labels.commandPaletteHint}
          noResults={labels.noResults}
        />
      </header>

      <nav
        aria-label={labels.mainNavigation}
        className="hidden w-56 shrink-0 flex-col gap-4 border-r border-border bg-surface p-4 sm:flex"
      >
        <OrganizationPicker
          organizations={organizations}
          value={current}
          onChange={onSwitch}
          label={labels.switchOrganization}
          disabled={pending}
        />
        <CommandPalette
          items={items}
          label={labels.commandPalette}
          hint={labels.commandPaletteHint}
          noResults={labels.noResults}
        />
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>
              <NavLink href={item.href} active={isActive(pathname, item.href)}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 px-4 py-6 pb-24 sm:px-8 sm:pb-8">{children}</main>

      {/* Bottom bar, thumb-reachable, at most four targets so each stays wide. */}
      <nav
        aria-label={labels.mainNavigation}
        className="fixed inset-x-0 bottom-0 grid border-t border-border bg-surface sm:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => (
          <NavLink key={item.key} href={item.href} active={isActive(pathname, item.href)} compact>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** /app matches only itself; every other entry also matches its subtree. */
function isActive(pathname: string, href: string): boolean {
  return href === '/app' ? pathname === href : pathname.startsWith(href)
}

function NavLink({
  href,
  active,
  compact,
  children,
}: {
  href: string
  active: boolean
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      // Routes are typed, but this list is data-driven; the entries are
      // declared in NAV_ENTRIES and covered by tests/unit/navigation.test.ts.
      href={href as '/app'}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-touch items-center rounded-doomee px-3 text-label font-medium',
        compact ? 'justify-center text-center' : '',
        active ? 'bg-doomee-black text-surface' : 'text-doomee-black hover:bg-surface-sunken',
      )}
    >
      {children}
    </Link>
  )
}

function OrganizationPicker({
  organizations,
  value,
  onChange,
  label,
  disabled,
}: {
  organizations: OrganizationChoice[]
  value: string
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
  label: string
  disabled: boolean
}) {
  if (organizations.length <= 1) {
    return <span className="truncate text-label font-semibold">{organizations[0]?.name}</span>
  }

  return (
    <select
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="min-h-touch w-full rounded-doomee border border-border bg-surface px-3 text-label font-medium"
    >
      {organizations.map((organization) => (
        <option key={organization.organizationId} value={organization.organizationId}>
          {organization.name}
        </option>
      ))}
    </select>
  )
}
