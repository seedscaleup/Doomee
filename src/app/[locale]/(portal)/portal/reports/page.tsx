import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { listPortalReports } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

/**
 * A client sees a report once it is PUBLISHED, and sees only the sections
 * marked visible. Neither condition is written here: both live in the policies
 * on `reports` and `report_sections` (ADR-026, ADR-057).
 */
export default async function PortalReportsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const reports = await listPortalReports({})
  const t = await getTranslations('portal.reports')

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {reports.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/portal/reports/${report.id}` as '/portal'}
                className="flex min-h-touch flex-col gap-1 rounded-doomee border border-border bg-surface p-4 hover:border-doomee-black"
              >
                <span className="font-medium">{report.title}</span>
                <span className="text-caption text-muted">
                  {report.projectName ? `${report.projectName} · ` : ''}
                  {report.periodStart} → {report.periodEnd}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
