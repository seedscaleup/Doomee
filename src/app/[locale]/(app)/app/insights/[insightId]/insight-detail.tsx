'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ConfirmDialog, PageHeader, StatusBadge } from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import { deleteInsight } from '@/modules/insights/mutations'
import type {
  ClientOption,
  InsightRow,
  LinkedActionRow,
  LinkedResultRow,
  ProjectOption,
  ResultOption,
} from '@/modules/insights/types'
import { InsightFormSheet } from '../insight-form-sheet'
import { NextActionPanel } from './next-action-panel'

export function InsightDetailScreen({
  insight,
  linkedResults,
  linkedActions,
  projects,
  clients,
  results,
  people,
  canManage,
  canConvert,
  backLabel,
}: {
  insight: InsightRow
  linkedResults: LinkedResultRow[]
  linkedActions: LinkedActionRow[]
  projects: ProjectOption[]
  clients: ClientOption[]
  results: ResultOption[]
  people: { userId: string; name: string }[]
  canManage: boolean
  canConvert: boolean
  backLabel: string
}) {
  const t = useTranslations('insights')
  const tForm = useTranslations('insights.form')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/app/insights"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {backLabel}
      </Link>

      <PageHeader
        title={insight.title}
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {tCommon('save')}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                {t('delete.action')}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {insight.projectName ? (
          <span className="text-label text-muted">{insight.projectName}</span>
        ) : null}
        {insight.clientName ? (
          <span className="text-label text-subtle">{insight.clientName}</span>
        ) : null}
        {insight.isClientVisible ? (
          <StatusBadge label={tForm('isClientVisible')} tone="success" />
        ) : null}
        {insight.authorName ? (
          <span className="ml-auto text-caption text-subtle">{insight.authorName}</span>
        ) : null}
      </div>

      {/* The four questions, in the order they get asked. */}
      <dl className="flex flex-col gap-4">
        <Block label={tForm('whatWorked')} value={insight.whatWorked} />
        <Block label={tForm('whatDidnt')} value={insight.whatDidnt} />
        <Block label={tForm('whatWeLearned')} value={insight.whatWeLearned} />
        <Block label={tForm('recommendation')} value={insight.recommendation} />
      </dl>

      {/* What the insight is BUILT ON — the difference between a finding and
          an opinion. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('results.title')}</h2>
        {linkedResults.length === 0 ? (
          <p className="text-label text-muted">{t('results.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linkedResults.map((result) => (
              <li
                key={result.id}
                className="flex flex-wrap items-center gap-2 rounded-doomee border border-border bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-label">
                  {result.title ?? result.projectName}
                </span>
                <span className="text-caption text-subtle">
                  {format.dateTime(new Date(result.recordedFor), { dateStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NextActionPanel
        insightId={insight.id}
        recommendation={insight.recommendation}
        defaultProjectId={insight.projectId}
        projects={projects}
        people={people}
        existing={linkedActions}
        canCreate={canConvert}
      />

      <InsightFormSheet
        open={editing && canManage}
        insight={{
          id: insight.id,
          title: insight.title,
          projectId: insight.projectId,
          clientId: insight.clientId,
          whatWorked: insight.whatWorked,
          whatDidnt: insight.whatDidnt,
          whatWeLearned: insight.whatWeLearned,
          recommendation: insight.recommendation,
          periodStart: insight.periodStart,
          periodEnd: insight.periodEnd,
          isClientVisible: insight.isClientVisible,
        }}
        projects={projects}
        clients={clients}
        results={results}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={deleting}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          await deleteInsight({ id: insight.id })
          setDeleting(false)
          router.push('/app/insights')
        }}
        onCancel={() => setDeleting(false)}
      />
    </section>
  )
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-label">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  )
}
