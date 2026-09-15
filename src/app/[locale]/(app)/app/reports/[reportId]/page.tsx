import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { lookupMessage } from '@/lib/i18n/translator'
import { can } from '@/lib/permissions'
import {
  getReport,
  listSections,
  listShares,
  preferencesFor,
  presentSection,
  resolveLabels,
} from '@/modules/reports'
import { requireActor, requirePageSession } from '@/server'
import { ReportEditor } from './report-editor'

export default async function ReportPage(props: {
  params: Promise<{ locale: string; reportId: string }>
}) {
  const { locale, reportId } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  const report = await getReport({ id: reportId })
  // 404, not 403: the query already applied the collaborator's project scope.
  if (!report) notFound()

  // Asked before the fetch it gates (ADR-038): share links are readable only by
  // whoever may publish, and a collaborator reading the report must not 404.
  const canPublish = can(actor, 'report.publish')

  const [sections, shares] = await Promise.all([
    listSections({ reportId }),
    canPublish ? listShares({ reportId }) : [],
  ])

  /**
   * Shaped AND worded on the server, in the report's own language.
   *
   * The same `presentSection` the PDF calls, and the same labels — so the
   * editor shows the document that will be exported rather than a translation
   * of it into whatever language the editor's interface happens to be in
   * (ADR-011). An agency must be able to read what its client will read.
   */
  const preferences = preferencesFor(report.locale, 'UTC')
  const shaped = sections.map((section) => {
    const blocks = presentSection(section.key, section.data, preferences)

    return {
      ...section,
      blocks,
      labels: resolveLabels(report.locale, blocks),
      heading:
        section.titleOverride ??
        lookupMessage(report.locale, `reports.sections.${section.key}`) ??
        section.key,
    }
  })

  const t = await getTranslations('reports')

  return (
    <ReportEditor
      report={report}
      sections={shaped}
      shares={shares}
      canPublish={canPublish}
      canExport={can(actor, 'report.export')}
      backLabel={t('back')}
    />
  )
}
