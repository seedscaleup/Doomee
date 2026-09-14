import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AppShell } from '@/components/layout/app-shell'
import { setActiveOrganization } from '@/lib/auth/session-store'
import { navigationFor } from '@/lib/permissions'
import { listMembershipsForUser } from '@/modules/organizations'
import { getSession, requireActor } from '@/server'

/**
 * The internal workspace gate.
 *
 * Authorisation lives here, in the Node server layer, not in middleware (D1):
 * a middleware check is bypassable, a layout check is not.
 */
export default async function AppLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params
  const session = await getSession()

  if (!session) redirect(`/${locale}/sign-in`)

  const memberships = await listMembershipsForUser(session.userId)

  /**
   * The internal workspace is for internal members. A client contact holds a
   * `client` membership and reaches the product through the portal instead
   * (CLAUDE.md §6) — and the same person may well be both: internal at their
   * own agency, a client contact at another (ADR-023). So this filters rather
   * than rejects, and the organisation switcher below only ever offers the
   * organisations this user is internal to.
   *
   * 404 and not 403 for the rest: confirming that an organisation exists is
   * itself a disclosure.
   */
  const organizations = memberships.filter((item) => item.role !== 'client')

  if (organizations.length === 0) {
    if (memberships.length > 0) notFound()
    redirect(`/${locale}/onboarding`)
  }

  // Heal a session whose active organisation is missing or stale — a member
  // removed from a tenant, or an account that just created its first one.
  // Without this the next server action resolves no actor and fails with a 403
  // the user can do nothing about.
  let active = organizations.find((item) => item.organizationId === session.activeOrganizationId)

  if (!active) {
    active = organizations[0]
    if (active) await setActiveOrganization(session.userId, active.organizationId)
  }

  const t = await getTranslations('nav')

  // The menu is derived from the actor's permissions, then labelled. The
  // interface never decides who sees what — it asks the same can() the server
  // asks, so what is shown and what is allowed cannot drift apart.
  const actor = await requireActor()
  const items = navigationFor(actor).map((entry) => ({
    key: entry.key,
    href: entry.href,
    label: t(entry.key),
    primary: entry.primary === true,
  }))

  return (
    <AppShell
      organizations={organizations}
      activeOrganizationId={active?.organizationId ?? ''}
      items={items}
      labels={{
        mainNavigation: t('mainNavigation'),
        switchOrganization: t('switchOrganization'),
        commandPalette: t('commandPalette'),
        commandPaletteHint: t('commandPaletteHint'),
        noResults: t('noResults'),
      }}
    >
      {props.children}
    </AppShell>
  )
}
