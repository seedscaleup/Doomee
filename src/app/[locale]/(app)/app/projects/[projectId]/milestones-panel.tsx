'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { EmptyState, SheetForm, StatusBadge } from '@/components/patterns'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { createMilestone, deleteMilestone, setMilestoneReached } from '@/modules/projects/mutations'
import { type MilestoneStatusValue, milestoneStatusFor } from '@/modules/projects/service'
import type { MilestoneRow } from '@/modules/projects/types'

/**
 * Milestones: the visible markers of a project.
 *
 * A milestone's status is DERIVED, not stored for display — reached is a fact
 * someone recorded, missed is the clock's verdict in the project's own
 * timezone. That way a list is never stale between nightly jobs.
 */
export function MilestonesPanel({
  projectId,
  milestones,
  timezone,
  canManage,
}: {
  projectId: string
  milestones: MilestoneRow[]
  timezone: string
  canManage: boolean
}) {
  const t = useTranslations('projects.milestones')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const now = new Date()

  async function onAdd(form: FormData) {
    setError(null)
    try {
      await createMilestone({
        projectId,
        title: String(form.get('title')),
        dueDate: asOptional(form.get('dueDate')),
        isClientVisible: form.get('isClientVisible') === 'on',
      })
      setAdding(false)
      router.refresh()
    } catch {
      setError(t('failed'))
    }
  }

  async function run(id: string, work: () => Promise<unknown>) {
    setError(null)
    setPending(id)
    try {
      await work()
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}>{t('add')}</Button>
        </div>
      ) : null}

      {milestones.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {milestones.map((milestone) => (
            <MilestoneItem
              key={milestone.id}
              milestone={milestone}
              status={milestoneStatusFor(milestone, timezone, now)}
              canManage={canManage}
              busy={pending !== null}
              pending={pending === milestone.id}
              onToggle={() =>
                run(milestone.id, () =>
                  setMilestoneReached({ id: milestone.id, reached: !milestone.reachedAt }),
                )
              }
              onDelete={() => run(milestone.id, () => deleteMilestone({ id: milestone.id }))}
            />
          ))}
        </ul>
      )}

      <SheetForm
        open={adding}
        title={t('add')}
        submitLabel={tCommon('save')}
        cancelLabel={tCommon('cancel')}
        pendingLabel={tCommon('loading')}
        onSubmit={onAdd}
        onCancel={() => setAdding(false)}
      >
        <Field label={t('titleField')}>
          {({ id }) => <TextInput id={id} name="title" required minLength={2} />}
        </Field>
        <Field label={t('dueDate')}>
          {({ id }) => <TextInput id={id} name="dueDate" type="date" />}
        </Field>
        <label className="flex min-h-touch items-center gap-2 text-label">
          <input type="checkbox" name="isClientVisible" className="size-4" />
          {t('clientVisible')}
        </label>
      </SheetForm>
    </div>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}

function MilestoneItem({
  milestone,
  status,
  canManage,
  busy,
  pending,
  onToggle,
  onDelete,
}: {
  milestone: MilestoneRow
  status: MilestoneStatusValue
  canManage: boolean
  busy: boolean
  pending: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const t = useTranslations('projects.milestones')
  const tStatus = useTranslations('status.milestone')
  const tCommon = useTranslations('common')
  const reached = Boolean(milestone.reachedAt)

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{milestone.title}</span>
        <span className="text-label text-muted">{milestone.dueDate ?? '—'}</span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <StatusBadge label={tStatus(status)} tone={TONES[status]} />
        {canManage ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={onToggle}>
              {pending ? tCommon('loading') : reached ? t('markUpcoming') : t('markReached')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onDelete}>
              {t('delete')}
            </Button>
          </>
        ) : null}
      </span>
    </li>
  )
}

const TONES: Record<MilestoneStatusValue, 'success' | 'danger' | 'neutral'> = {
  reached: 'success',
  missed: 'danger',
  upcoming: 'neutral',
}
