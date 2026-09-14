import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AppShell } from '@/components/layout/app-shell'
import { setActiveOrganization } from '@/lib/auth/session-store'
import { listMembershipsForUser } from '@/modules/organizations'
import { getSession } from '@/server'

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

  const organizations = await listMembershipsForUser(session.userId)
  if (organizations.length === 0) redirect(`/${locale}/onboarding`)

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

  return (
    <AppShell
      organizations={organizations}
      activeOrganizationId={active?.organizationId ?? ''}
      labels={{
        home: t('home'),
        team: t('team'),
        settings: t('settings'),
        switchOrganization: t('switchOrganization'),
      }}
    >
      {props.children}
    </AppShell>
  )
}
