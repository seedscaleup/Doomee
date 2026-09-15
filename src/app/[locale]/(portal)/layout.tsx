import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PortalShell } from '@/components/layout/portal-shell'
import { listMyClients } from '@/modules/portal'
import { getSession, requirePortalActor } from '@/server'

/**
 * The portal gate.
 *
 * Authorisation lives HERE, in the Node server layer, not in middleware (D1):
 * a middleware check is bypassable, a layout check is not.
 *
 * `requirePortalActor` refuses anything that is not an active `client`
 * membership, and it refuses with a 404 — an internal member who wanders onto
 * a portal URL learns nothing, and neither does anyone else (CLAUDE.md §6).
 */
export default async function PortalLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params
  const session = await getSession()
  if (!session) redirect(`/${locale}/sign-in`)

  const actor = await requirePortalActor().catch(() => null)
  if (!actor) notFound()

  const accounts = await listMyClients()
  const t = await getTranslations('portal')

  const items = [
    { key: 'overview', href: '/portal', label: t('nav.overview') },
    { key: 'projects', href: '/portal/projects', label: t('nav.projects') },
    { key: 'deliverables', href: '/portal/deliverables', label: t('nav.deliverables') },
    { key: 'results', href: '/portal/results', label: t('nav.results') },
    { key: 'messages', href: '/portal/messages', label: t('nav.messages') },
    { key: 'reports', href: '/portal/reports', label: t('nav.reports') },
  ]

  return (
    <PortalShell
      accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      activeAccountId={accounts[0]?.id ?? ''}
      items={items}
      labels={{
        shellLabel: t('shellLabel'),
        switchAccount: t('switchAccount'),
        title: t('title'),
      }}
    >
      {props.children}
    </PortalShell>
  )
}
