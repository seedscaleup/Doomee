'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusBadge,
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
import { DueDate } from '../due-date'
import { ActionFormSheet } from './action-form-sheet'
import { AttachmentsPanel } from './attachments-panel'
import { CommentsPanel } from './comments-panel'

type ActivityEntry = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}

const TABS = ['overview', 'comments', 'attachments', 'activity'] as const
type Tab = (typeof TABS)[number]

export function ActionDetailScreen({
  action,
  collaborators,
  comments,
  attachments,
  taxonomies,
  people,
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
  locale: Locale
  canEdit: boolean
  activity: ActivityEntry[]
}) {
  const t = useTranslations('actions')
  const tStatus = useTranslations('status.action')
  const tActivity = useTranslations('activity')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
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

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={tStatus(action.status)} tone={statusTone(action.status)} />
        <DueDate action={action} />
        <span className="text-label text-muted">{action.assigneeName ?? t('unassigned')}</span>
      </div>

      {action.blockedReason ? <Alert tone="warning">{action.blockedReason}</Alert> : null}

      {canEdit && moves.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {moves.map((status) => (
            <Button key={status} variant="secondary" onClick={() => move(status)}>
              {tStatus(status)}
            </Button>
          ))}
        </div>
      ) : null}

      <div role="tablist" aria-label={action.title} className="flex gap-1 border-b border-border">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={
              tab === name
                ? 'min-h-touch border-b-2 border-doomee-black px-3 text-label font-semibold'
                : 'min-h-touch border-b-2 border-transparent px-3 text-label text-muted'
            }
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <Overview
          action={action}
          collaborators={collaborators}
          taxonomies={taxonomies}
          locale={locale}
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
