'use client'

import { useState, useTransition } from 'react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { switchOrganization } from '@/modules/organizations/switch-action'

export type OrganizationChoice = { organizationId: string; name: string }

/**
 * Internal shell: a bottom bar on mobile, a side rail from `sm` up.
 * Designed at 375px first, with 44px touch targets (CLAUDE.md rule 9).
 */
export function AppShell({
  organizations,
  activeOrganizationId,
  labels,
  children,
}: {
  organizations: OrganizationChoice[]
  activeOrganizationId: string
  labels: { home: string; team: string; settings: string; switchOrganization: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [current, setCurrent] = useState(activeOrganizationId)

  const items = [
    { href: '/app', label: labels.home },
    { href: '/app/team', label: labels.team },
    { href: '/app/settings', label: labels.settings },
  ] as const

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
      </header>

      <nav
        aria-label={labels.home}
        className="hidden w-56 shrink-0 flex-col gap-4 border-r border-border bg-surface p-4 sm:flex"
      >
        <OrganizationPicker
          organizations={organizations}
          value={current}
          onChange={onSwitch}
          label={labels.switchOrganization}
          disabled={pending}
        />
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} active={pathname === item.href}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 px-4 py-6 pb-24 sm:px-8 sm:pb-8">{children}</main>

      <nav
        aria-label={labels.home}
        className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-border bg-surface sm:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} active={pathname === item.href} compact>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function NavLink({
  href,
  active,
  compact,
  children,
}: {
  href: '/app' | '/app/team' | '/app/settings'
  active: boolean
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center rounded-[--radius-doomee] px-3 text-sm font-medium',
        compact ? 'justify-center' : '',
        active ? 'bg-doomee-black text-surface' : 'text-doomee-black',
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
    return <span className="text-sm font-semibold">{organizations[0]?.name}</span>
  }

  return (
    <select
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="min-h-11 w-full rounded-[--radius-doomee] border border-border bg-surface px-3 text-sm font-medium"
    >
      {organizations.map((organization) => (
        <option key={organization.organizationId} value={organization.organizationId}>
          {organization.name}
        </option>
      ))}
    </select>
  )
}
