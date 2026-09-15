'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { ConfirmDialog, PageHeader, StatusBadge } from '@/components/patterns'
import { Alert, Button } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import {
  archiveReport,
  deleteReport,
  exportReport,
  publishReport,
} from '@/modules/reports/mutations'
import { isEditable, isShareable, statusTone } from '@/modules/reports/service'
import type { ReportRow, ShareRow } from '@/modules/reports/types'
import { SectionEditor } from './section-editor'
import { SharePanel } from './share-panel'
import type { EditableSection } from './types'

/**
 * ============================================================================
 * THE REPORT EDITOR.
 *
 * Sections arrive already filled in. What the editor adds is the three
 * decisions a person actually has to make: what goes in, in what order, and
 * WHAT THE CLIENT SEES — the last one section by section, because "what the
 * client sees" is not a property of a report, it is eleven separate choices.
 *
 * Publishing freezes the document (ADR-014), and the screen says so before the
 * click rather than after it.
 * ============================================================================
 */
/**
 * The header's buttons.
 *
 * Which of them exist depends on the report's STATE and the reader's
 * permissions, and that is two questions per button. Kept together here so the
 * editor itself reads as "header, sections, shares, confirmations" rather than
 * as a list of conditions.
 */
function ReportActions({
  report,
  canPublish,
  canExport,
  exporting,
  onExport,
  onConfirm,
}: {
  report: ReportRow
  canPublish: boolean
  canExport: boolean
  exporting: boolean
  onExport: () => void
  onConfirm: (action: 'publish' | 'archive' | 'delete') => void
}) {
  const t = useTranslations('reports.editor')
  const tReports = useTranslations('reports')
  const editable = isEditable(report.status)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge label={tReports(`statuses.${report.status}`)} tone={statusTone(report.status)} />

      {canExport && report.status === 'published' ? (
        <Button variant="secondary" onClick={onExport} disabled={exporting}>
          {exporting ? t('exporting') : t('exportPdf')}
        </Button>
      ) : null}

      {canPublish && editable ? (
        <Button onClick={() => onConfirm('publish')}>{t('publish')}</Button>
      ) : null}

      {canPublish && report.status === 'published' ? (
        <Button variant="secondary" onClick={() => onConfirm('archive')}>
          {t('archive')}
        </Button>
      ) : null}

      {canPublish && editable ? (
        <Button variant="ghost" onClick={() => onConfirm('delete')}>
          {t('delete')}
        </Button>
      ) : null}
    </div>
  )
}

export function ReportEditor({
  report,
  sections,
  shares,
  canPublish,
  canExport,
  backLabel,
}: {
  report: ReportRow
  sections: EditableSection[]
  shares: ShareRow[]
  canPublish: boolean
  canExport: boolean
  backLabel: string
}) {
  const t = useTranslations('reports.editor')
  const _tReports = useTranslations('reports')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'publish' | 'archive' | 'delete' | null>(null)
  const [exporting, startExport] = useTransition()

  const editable = isEditable(report.status)
  const shareable = isShareable(report.status)

  async function run(work: () => Promise<unknown>, after: 'refresh' | 'list' = 'refresh') {
    setError(null)
    try {
      await work()
      setConfirming(null)
      if (after === 'list') router.push('/app/reports')
      else router.refresh()
    } catch {
      setConfirming(null)
      setError(t('failed'))
    }
  }

  function download() {
    setError(null)
    startExport(async () => {
      try {
        // The link is signed and short-lived (R13), so it is handed over rather
        // than stored: a five-minute URL in a bookmark is a broken bookmark.
        const result = await exportReport({ id: report.id })
        setDownloadUrl(result.url)
      } catch {
        setError(t('failed'))
      }
    })
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/app/reports" className="text-label text-muted hover:underline">
          {backLabel}
        </Link>
      </div>

      <PageHeader
        title={report.title}
        description={`${report.projectName ?? report.clientName ?? ''} ${report.periodStart} → ${report.periodEnd}`.trim()}
        action={
          <ReportActions
            report={report}
            canPublish={canPublish}
            canExport={canExport}
            exporting={exporting}
            onExport={download}
            onConfirm={setConfirming}
          />
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {report.status === 'published' ? <Alert tone="success">{t('publishedNotice')}</Alert> : null}
      {report.status === 'archived' ? <Alert tone="warning">{t('archived')}</Alert> : null}

      {downloadUrl ? (
        <Alert tone="success">
          <a href={downloadUrl} className="underline" rel="noreferrer">
            {t('exportReady')}
          </a>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <h2 className="text-section font-semibold">{t('sections')}</h2>
        {sections.map((section, index) => (
          <SectionEditor
            key={section.id}
            section={section}
            editable={editable}
            isFirst={index === 0}
            isLast={index === sections.length - 1}
            onChanged={() => router.refresh()}
            onError={() => setError(t('failed'))}
          />
        ))}
      </div>

      {canPublish ? (
        <SharePanel
          reportId={report.id}
          shares={shares}
          shareable={shareable}
          onChanged={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={confirming === 'publish'}
        title={t('publish')}
        description={t('publishHint')}
        confirmLabel={t('publish')}
        cancelLabel={tCommon('cancel')}
        tone="neutral"
        onConfirm={() => run(() => publishReport({ id: report.id }))}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'archive'}
        title={t('archive')}
        confirmLabel={t('archive')}
        cancelLabel={tCommon('cancel')}
        tone="neutral"
        onConfirm={() => run(() => archiveReport({ id: report.id }))}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        title={t('deleteConfirm')}
        description={t('deleteDescription')}
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        onConfirm={() => run(() => deleteReport({ id: report.id }), 'list')}
        onCancel={() => setConfirming(null)}
      />
    </section>
  )
}
