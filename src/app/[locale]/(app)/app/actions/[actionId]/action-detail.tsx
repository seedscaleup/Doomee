'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
  type TimelineEntry,
} from '@/components/patterns'
import { Alert, Button } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { changeActionStatus, deleteAction } from '@/modules/actions/mutations'
import { allowedTransitions, statusTone } from '@/modules/actions/service'
import type {
  ActionDetail,
  ActionStatusValue,
  AttachmentRow,
  CommentRow,
  PersonOption,
  TaxonomyOption,
} from '@/modules/actions/types'
import type { FormTemplate, ResultRow } from '@/modules/results/types'
import { DueDate } from '../due-date'
import { ActionFormSheet } from './action-form-sheet'
import { AttachmentsPanel } from './attachments-panel'
import { CommentsPanel } from './comments-panel'
import { ResultFormSheet } from './result-form-sheet'

type ActivityEntry = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}

const TABS = ['overview', 'results', 'comments', 'attachments', 'activity'] as const
type Tab = (typeof TABS)[number]

export function ActionDetailScreen({
  action,
  collaborators,
  comments,
  attachments,
  taxonomies,
  people,
  form,
  results,
  locale,
  canEdit,
  activity,
}: {
  action: ActionDetail
  collaborators: PersonOption[]
  comments: CommentRow[]
  attachments: AttachmentRow[]
  taxonomies: { types: TaxonomyOption[]; categories: TaxonomyOption[]; channels: TaxonomyOption[] }
  people: PersonOption[]
  /** The smart form for this action's type. Null when the reader cannot record. */
  form: FormTemplate | null
  results: ResultRow[]
  locale: Locale
  canEdit: boolean
  activity: ActivityEntry[]
}) {
  const t = useTranslations('actions')
  const tActivity = useTranslations('activity')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
  const [recording, setRecording] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entries: TimelineEntry[] = activity.map((entry) => ({
    id: entry.id,
    content: tActivity(entry.verb, {
      actor: entry.actorName ?? tActivity('unknownActor'),
      name: String(entry.params.name ?? action.title),
    }),
    timestamp: format.dateTime(new Date(entry.createdAt), {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  }))

  /**
   * One-click moves. Only the transitions the machine accepts are offered —
   * the server checks again, this is about not presenting a refusal (UX 5).
   * `blocked` is not among them: it needs a reason, so it goes through the form.
   */
  const moves = allowedTransitions(action.status).filter((status) => status !== 'blocked')

  async function move(status: ActionStatusValue) {
    setError(null)
    try {
      await changeActionStatus({ id: action.id, status })
      router.refresh()
    } catch {
      setError(t('form.failed'))
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <Link
        href={`/app/projects/${action.projectId}` as '/app'}
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {action.projectName}
      </Link>

      <PageHeader
        title={action.title}
        description={action.description ?? undefined}
        action={
          canEdit ? (
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

      {error ? <Alert tone="error">{error}</Alert> : null}

      <RecordResultsPrompt
        visible={action.status === 'done' && results.length === 0 && Boolean(form) && canEdit}
        onRecord={() => setRecording(true)}
      />

      <ActionSummary action={action} canEdit={canEdit} moves={moves} onMove={move} />

      <Tabs
        tabs={TABS.map((name) => ({ key: name, label: t(`tabs.${name}`) }))}
        active={tab}
        onSelect={setTab}
        label={action.title}
      />

      {tab === 'overview' ? (
        <Overview
          action={action}
          collaborators={collaborators}
          taxonomies={taxonomies}
          locale={locale}
        />
      ) : null}

      {tab === 'results' ? (
        <ResultsPanel
          results={results}
          canRecord={Boolean(form) && canEdit}
          onRecord={() => setRecording(true)}
        />
      ) : null}

      {tab === 'comments' ? (
        <CommentsPanel actionId={action.id} comments={comments} people={people} />
      ) : null}

      {tab === 'attachments' ? (
        <AttachmentsPanel actionId={action.id} attachments={attachments} canEdit={canEdit} />
      ) : null}

      {tab === 'activity' ? (
        entries.length > 0 ? (
          <Timeline entries={entries} />
        ) : (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        )
      ) : null}

      <ResultFormSheet
        open={recording && canEdit}
        projectId={action.projectId}
        actionId={action.id}
        template={form}
        locale={locale}
        onClose={() => setRecording(false)}
        onSaved={() => {
          setRecording(false)
          router.refresh()
        }}
      />

      <ActionFormSheet
        open={editing && canEdit}
        action={action}
        collaborators={collaborators}
        taxonomies={taxonomies}
        people={people}
        locale={locale}
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
          await deleteAction({ id: action.id })
          setDeleting(false)
          router.push('/app/actions' as '/app')
        }}
        onCancel={() => setDeleting(false)}
      />
    </section>
  )
}

function Overview({
  action,
  collaborators,
  taxonomies,
  locale,
}: {
  action: ActionDetail
  collaborators: PersonOption[]
  taxonomies: { types: TaxonomyOption[]; categories: TaxonomyOption[]; channels: TaxonomyOption[] }
  locale: Locale
}) {
  const t = useTranslations('actions.form')
  const tCommon = useTranslations('common')
  const label = (options: TaxonomyOption[], id: string | null) =>
    options.find((option) => option.id === id)?.labels[locale] ?? null

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Detail label={t('actionType')} value={label(taxonomies.types, action.actionTypeId)} />
      <Detail label={t('category')} value={label(taxonomies.categories, action.categoryId)} />
      <Detail label={t('channel')} value={label(taxonomies.channels, action.channelId)} />
      <Detail label={t('startDate')} value={action.startDate} />
      <Detail label={t('dueDate')} value={action.dueDate} />
      <Detail
        label={t('estimatedMinutes')}
        value={action.estimatedMinutes === null ? null : String(action.estimatedMinutes)}
      />
      <Detail
        label={t('spentMinutes')}
        value={action.spentMinutes === null ? null : String(action.spentMinutes)}
      />
      <Detail
        label={t('collaborators')}
        value={collaborators.map((person) => person.name).join(', ')}
      />
      <Detail
        label={t('isClientVisible')}
        value={action.isClientVisible ? tCommon('confirm') : tCommon('none')}
      />
    </dl>
  )
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-label">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  )
}

/** The results already recorded for this action, and the way to add one. */
function ResultsPanel({
  results,
  canRecord,
  onRecord,
}: {
  results: ResultRow[]
  canRecord: boolean
  onRecord: () => void
}) {
  const t = useTranslations('results')
  const format = useFormatter()

  if (results.length === 0) {
    return (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={canRecord ? <Button onClick={onRecord}>{t('add')}</Button> : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {canRecord ? (
        <div className="flex justify-end">
          <Button onClick={onRecord}>{t('add')}</Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {results.map((result) => (
          <li
            key={result.id}
            className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-3"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {result.title ??
                  t('untitled', {
                    date: format.dateTime(new Date(result.recordedFor), { dateStyle: 'short' }),
                  })}
              </span>
              <span className="text-caption text-subtle">
                {t('totals.samples', { count: result.metricCount })}
              </span>
            </span>
            {result.analysis ? <p className="text-label">{result.analysis}</p> : null}
            {result.recommendation ? (
              <p className="text-label text-muted">{result.recommendation}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Status, deadline, owner — and the moves the machine allows from here. */
function ActionSummary({
  action,
  canEdit,
  moves,
  onMove,
}: {
  action: ActionDetail
  canEdit: boolean
  moves: readonly ActionStatusValue[]
  onMove: (status: ActionStatusValue) => void
}) {
  const t = useTranslations('actions')
  const tStatus = useTranslations('status.action')

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={tStatus(action.status)} tone={statusTone(action.status)} />
        <DueDate action={action} />
        <span className="text-label text-muted">{action.assigneeName ?? t('unassigned')}</span>
      </div>

      {action.blockedReason ? <Alert tone="warning">{action.blockedReason}</Alert> : null}

      {canEdit && moves.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {moves.map((status) => (
            <Button key={status} variant="secondary" onClick={() => onMove(status)}>
              {tStatus(status)}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  )
}

/**
 * THE LOOP CLOSING.
 *
 * An action that is done and has produced nothing recorded is where the product
 * stops being different from a task manager. So it asks — and only asks:
 * dismissible, never blocking (roadmap LOT 7.4). Forcing a form on someone who
 * has not got the numbers yet is how you collect zeros.
 */
function RecordResultsPrompt({ visible, onRecord }: { visible: boolean; onRecord: () => void }) {
  const t = useTranslations('results')
  const [dismissed, setDismissed] = useState(false)

  if (!visible || dismissed) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-doomee border border-doomee-yellow bg-doomee-yellow-soft px-4 py-3">
      <span className="text-label font-medium">{t('addHint')}</span>
      <span className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={() => setDismissed(true)}>
          {t('later')}
        </Button>
        <Button onClick={onRecord}>{t('add')}</Button>
      </span>
    </div>
  )
}
