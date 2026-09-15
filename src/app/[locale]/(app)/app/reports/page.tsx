import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listReportScopes, listReports } from '@/modules/reports'
import { getProfile } from '@/modules/settings'
import { requireActor, requirePageSession } from '@/server'
import { ReportsScreen } from './reports-screen'

export default async function ReportsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  // Asked BEFORE the fetch: the wizard's options are readable only by whoever
  // may create a report, and a reader who may not must still see the list
  // rather than a 404 (ADR-038).
  const canCreate = can(actor, 'report.create')

  const [rows, scopes, profile] = await Promise.all([
    listReports({}),
    canCreate ? listReportScopes() : { projects: [], clients: [] },
    getProfile(),
  ])

  const t = await getTranslations('reports')

  return (
    <ReportsScreen
      rows={rows}
      projects={scopes.projects}
      clients={scopes.clients}
      canCreate={canCreate}
      /** The author's own reporting language, not their interface language (ADR-011). */
      defaultLocale={profile.reportLocale}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}
