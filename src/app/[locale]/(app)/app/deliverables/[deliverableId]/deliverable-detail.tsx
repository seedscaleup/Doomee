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
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import {
  deleteDeliverable,
  reviewInternally,
  transitionDeliverable,
} from '@/modules/deliverables/mutations'
import {
  allowedTransitions,
  type DeliverableStatusValue,
  statusTone,
} from '@/modules/deliverables/service'
import type {
  DeliverableDetail,
  PersonOption,
  ProjectOption,
  ReviewRow,
  TaxonomyOption,
  VersionRow,
} from '@/modules/deliverables/types'
import { DeliverableFormSheet } from '../deliverable-form-sheet'
import { VersionSheet } from './version-sheet'

type ActivityEntry = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}

const TABS = ['overview', 'versions', 'reviews', 'activity'] as const
type Tab = (typeof TABS)[number]

export function DeliverableDetailScreen({
  deliverable,
  versions,
  reviews,
  activity,
  types,
  owners,
  projects,
  locale,
  canManage,
  canReview,
  backLabel,
}: {
  deliverable: DeliverableDetail
  versions: VersionRow[]
  reviews: ReviewRow[]
  activity: ActivityEntry[]
  types: TaxonomyOption[]
  owners: PersonOption[]
  projects: ProjectOption[]
  locale: Locale
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canManage: boolean
  canReview: boolean
  backLabel: string
}) {
  const t = useTranslations('deliverables')
  const tStatus = useTranslations('status.deliverable')
  const tActivity = useTranslations('activity')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [addingVersion, setAddingVersion] = useState(false)

  const entries: TimelineEntry[] = activity.map((entry) => ({
    id: entry.id,
    content: tActivity(entry.verb, {
      actor: entry.actorName ?? tActivity('unknownActor'),
      name: String(entry.params.name ?? deliverable.title),
      version: String(entry.params.version ?? ''),
    }),
    timestamp: format.dateTime(new Date(entry.createdAt), {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  }))

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/app/deliverables"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {backLabel}
      </Link>

      <PageHeader
        title={deliverable.title}
        description={deliverable.description ?? undefined}
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
        <StatusBadge label={tStatus(deliverable.status)} tone={statusTone(deliverable.status)} />
        <span className="text-label text-muted">{deliverable.projectName}</span>
        {deliverable.clientName ? (
          <span className="text-label text-subtle">{deliverable.clientName}</span>
        ) : null}
        <span className="text-caption text-subtle">
          {deliverable.currentVersion === null
            ? t('noVersion')
            : t('currentVersion', { version: deliverable.currentVersion })}
        </span>
      </div>

      <FlowPanel
        deliverable={deliverable}
        hasVersion={versions.length > 0}
        canManage={canManage}
        canReview={canReview}
        onDone={() => router.refresh()}
      />

      <Tabs
        tabs={TABS.map((name) => ({ key: name, label: t(`tabs.${name}`) }))}
        active={tab}
        onSelect={setTab}
        label={deliverable.title}
      />

      {tab === 'overview' ? <Overview deliverable={deliverable} locale={locale} /> : null}

      {tab === 'versions' ? (
        <VersionsPanel
          versions={versions}
          canManage={canManage}
          onAdd={() => setAddingVersion(true)}
        />
      ) : null}

      {tab === 'reviews' ? (
        <ReviewsPanel
          reviews={reviews}
          deliverable={deliverable}
          canReview={canReview}
          hasVersion={versions.length > 0}
          onDone={() => router.refresh()}
        />
      ) : null}

      {tab === 'activity' ? (
        entries.length > 0 ? (
          <Timeline entries={entries} />
        ) : (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        )
      ) : null}

      <DeliverableFormSheet
        open={editing && canManage}
        deliverable={{
          id: deliverable.id,
          title: deliverable.title,
          description: deliverable.description,
          deliverableTypeId: deliverable.deliverableTypeId,
          ownerUserId: deliverable.ownerUserId,
          dueDate: deliverable.dueDate,
          externalUrl: deliverable.externalUrl,
        }}
        projects={projects}
        types={types}
        owners={owners}
        locale={locale}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />

      <VersionSheet
        open={addingVersion && canManage}
        deliverableId={deliverable.id}
        onClose={() => setAddingVersion(false)}
        onSaved={() => {
          setAddingVersion(false)
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
          await deleteDeliverable({ id: deliverable.id })
          setDeleting(false)
          router.push('/app/deliverables')
        }}
        onCancel={() => setDeleting(false)}
      />
    </section>
  )
}

/** Every iteration, newest first — and the button that adds the next one. */
function VersionsPanel({
  versions,
  canManage,
  onAdd,
}: {
  versions: VersionRow[]
  canManage: boolean
  onAdd: () => void
}) {
  const t = useTranslations('deliverables.versions')

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={onAdd}>{t('add')}</Button>
        </div>
      ) : null}
      {versions.length === 0 ? (
        <EmptyState title={t('title')} description={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <VersionCard key={version.id} version={version} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * What happens next — and, when nothing can, why.
 *
 * In `client_review` the internal team sees no buttons at all and a sentence
 * saying whose decision it is. That is the whole asymmetry of the lot made
 * visible: an agency that can approve its own work has not built a validation
 * step (ADR-041 — a blocked action says why).
 */
function FlowPanel({
  deliverable,
  hasVersion,
  canManage,
  canReview,
  onDone,
}: {
  deliverable: DeliverableDetail
  hasVersion: boolean
  canManage: boolean
  canReview: boolean
  onDone: () => void
}) {
  const t = useTranslations('deliverables.flow')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // The screen offers only what the machine would accept, from the INTERNAL
  // side. The server asks the same question again.
  const moves = allowedTransitions(deliverable.status, 'internal')

  async function move(to: DeliverableStatusValue) {
    setError(null)
    setPending(true)
    try {
      await transitionDeliverable({ id: deliverable.id, to })
      onDone()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-doomee border border-border bg-surface px-4 py-3">
      <h2 className="text-label font-semibold">{t('title')}</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {deliverable.status === 'published' ? (
        <p className="text-label text-muted">{t('done')}</p>
      ) : deliverable.status === 'client_review' ? (
        // Waiting on the client. Internal roles get an explanation, not a
        // disabled button they might think is broken.
        <p className="text-label text-muted">{canReview ? t('waitingClient') : t('clientOnly')}</p>
      ) : moves.length === 0 || !canManage ? (
        <p className="text-label text-muted">{t('clientOnly')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {moves.map((to) => (
            <Button
              key={to}
              variant={to === 'client_review' ? 'primary' : 'secondary'}
              // Nothing to send is a reason, not a mystery: the server says the
              // same thing, this only avoids offering the trip.
              disabled={pending || (to === 'client_review' && !hasVersion)}
              onClick={() => move(to)}
            >
              {t(to)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The internal manager's verdict, and the history of every decision.
 *
 * A client decision is NOT taken from here: `reviewAsClient` is guarded by
 * `deliverable.approve`, which no internal role holds. The client acts from the
 * portal (LOT 9).
 */
function ReviewsPanel({
  reviews,
  deliverable,
  canReview,
  hasVersion,
  onDone,
}: {
  reviews: ReviewRow[]
  deliverable: DeliverableDetail
  canReview: boolean
  hasVersion: boolean
  onDone: () => void
}) {
  const t = useTranslations('deliverables.reviews')
  const format = useFormatter()
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [pending, setPending] = useState(false)

  async function decide(decision: 'approved' | 'changes_requested') {
    setError(null)
    if (decision === 'changes_requested' && comment.trim().length === 0) {
      setError(t('commentRequired'))
      return
    }

    setPending(true)
    try {
      await reviewInternally({
        id: deliverable.id,
        decision,
        comment: comment.trim() || undefined,
      })
      setComment('')
      onDone()
    } catch {
      setError(t('commentRequired'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canReview && hasVersion && deliverable.status === 'internal_review' ? (
        <div className="flex flex-col gap-3 rounded-doomee border border-border bg-surface px-4 py-3">
          <h2 className="text-label font-semibold">{t('internalTitle')}</h2>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label={t('comment')}>
            {({ id }) => (
              <TextInput
                id={id}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => decide('approved')}>
              {t('approve')}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => decide('changes_requested')}
            >
              {t('requestChanges')}
            </Button>
          </div>
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <EmptyState title={t('title')} description={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-4 py-3"
            >
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={t(review.decision)}
                  tone={review.decision === 'approved' ? 'success' : 'warning'}
                />
                <span className="text-caption text-muted">{t(review.scope)}</span>
                <span className="text-caption text-subtle">
                  {t('onVersion', { version: review.version })}
                </span>
                <span className="ml-auto text-caption text-subtle">
                  {format.dateTime(new Date(review.createdAt), { dateStyle: 'short' })}
                </span>
              </span>
              {review.comment ? <p className="text-label">{review.comment}</p> : null}
              {review.reviewerName ? (
                <span className="text-caption text-subtle">{review.reviewerName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VersionCard({ version }: { version: VersionRow }) {
  const t = useTranslations('deliverables')
  const format = useFormatter()

  return (
    <li className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-4 py-3">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t('currentVersion', { version: version.version })}</span>
        <span className="ml-auto text-caption text-subtle">
          {format.dateTime(new Date(version.createdAt), { dateStyle: 'short' })}
        </span>
      </span>
      {version.notes ? <p className="text-label text-muted">{version.notes}</p> : null}
      <span className="flex flex-wrap items-center gap-3">
        {version.url ? (
          // A signed link that expires (R13). Never a public object URL.
          <a
            href={version.url}
            className="text-label underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            {version.filename ?? t('versions.download')}
          </a>
        ) : null}
        {version.externalUrl ? (
          <a
            href={version.externalUrl}
            className="text-label underline underline-offset-4"
            rel="noreferrer noopener"
            target="_blank"
          >
            {t('versions.open')}
          </a>
        ) : null}
        {version.createdByName ? (
          <span className="text-caption text-subtle">
            {t('versions.by', { name: version.createdByName })}
          </span>
        ) : null}
      </span>
    </li>
  )
}

function Overview({ deliverable, locale }: { deliverable: DeliverableDetail; locale: Locale }) {
  const t = useTranslations('deliverables.form')
  const tCommon = useTranslations('common')

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Detail label={t('project')} value={deliverable.projectName} />
      <Detail label={t('type')} value={deliverable.typeLabels?.[locale] ?? t('noType')} />
      <Detail label={t('owner')} value={deliverable.ownerName} />
      <Detail label={t('dueDate')} value={deliverable.dueDate} />
      <Detail
        label={t('isClientVisible')}
        value={deliverable.isClientVisible ? tCommon('confirm') : tCommon('none')}
      />
      {deliverable.externalUrl ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption uppercase tracking-wide text-subtle">{t('externalUrl')}</dt>
          <dd>
            <a
              href={deliverable.externalUrl}
              className="text-label underline underline-offset-4"
              rel="noreferrer noopener"
              target="_blank"
            >
              {deliverable.externalUrl}
            </a>
          </dd>
        </div>
      ) : null}
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
