import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { lookupMessage } from '@/lib/i18n/translator'
import { getPortalReport } from '@/modules/portal'
import {
  preferencesFor,
  presentSection,
  resolveLabels,
  SECTION_KEYS,
  type SectionKey,
} from '@/modules/reports'
import { BlocksView } from '@/modules/reports/components/blocks-view'
import { requirePortalPageSession } from '@/server'

export default async function PortalReportPage(props: {
  params: Promise<{ locale: string; reportId: string }>
}) {
  const { locale, reportId } = await props.params
  await requirePortalPageSession(locale)

  const report = await getPortalReport({ id: reportId })
  // 404, never 403 — a client must not learn that a report exists (rule 6).
  if (!report) notFound()

  const t = await getTranslations('portal.reports')

  /**
   * Rendered in the REPORT's language, not the reader's (ADR-011). A client
   * browsing the portal in French still reads the English report they were
   * sent, because the document and the interface are two different languages.
   */
  const reportLocale = isLocale(report.locale) ? report.locale : 'fr'
  const preferences = preferencesFor(reportLocale, 'UTC')
  const translate = (key: string) =>
    lookupMessage(reportLocale, key.includes('.') ? key : `reports.fields.${key}`) ??
    key.split('.').at(-1) ??
    key

  return (
    <section className="flex flex-col gap-6">
      <Link href="/portal/reports" className="text-label text-muted hover:underline">
        {t('back')}
      </Link>

      <PageHeader
        title={report.title}
        description={`${report.projectName ? `${report.projectName} · ` : ''}${report.periodStart} → ${report.periodEnd}`}
      />

      <div className="flex flex-col gap-8">
        {report.sections.map((section) => {
          const key = asSectionKey(section.key)
          const blocks = presentSection(key, section.data, preferences)

          return (
            <article key={section.id} className="flex flex-col gap-3">
              <h2 className="text-section font-semibold">
                {section.titleOverride ?? translate(`reports.sections.${key}`)}
              </h2>
              {section.body ? <p className="whitespace-pre-line">{section.body}</p> : null}
              <BlocksView
                blocks={blocks}
                emptyLabel={t('noData')}
                labels={resolveLabels(reportLocale, blocks)}
              />
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** The view's `key` column is text. An unknown one degrades rather than throws (R7). */
function asSectionKey(value: string): SectionKey {
  return SECTION_KEYS.find((key) => key === value) ?? 'executive_summary'
}
