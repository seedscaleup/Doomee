'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/patterns'
import { Alert, Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { deleteObjective } from '@/modules/objectives/mutations'
import {
  computeGap,
  type Gap,
  gapTone,
  periodElapsedPercent,
  periodStanding,
  statusTone,
  suggestedStatus,
  toNumber,
} from '@/modules/objectives/service'
import type {
  MetricOption,
  ObjectiveRow,
  PersonOption,
  TaxonomyOption,
} from '@/modules/objectives/types'
import { ObjectiveFormSheet } from './objective-form-sheet'

/**
 * `Objectif → Résultat réel → Écart → Analyse`, the comparison the whole product
 * is built to make.
 *
 * The "actual" column is filled by results (LOT 7). Until then it says so out
 * loud rather than showing an empty cell — an objective with no result yet is a
 * different thing from one that was missed.
 */
export function ObjectivesPanel({
  projectId,
  objectives,
  metrics,
  types,
  people,
  locale,
  canManage,
}: {
  projectId: string
  objectives: ObjectiveRow[]
  metrics: MetricOption[]
  types: TaxonomyOption[]
  people: PersonOption[]
  locale: Locale
  canManage: boolean
}) {
  const t = useTranslations('objectives')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ObjectiveRow | null>(null)
  const [deleting, setDeleting] = useState<ObjectiveRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-muted">{t('awaitingResults')}</p>
          <Button onClick={() => setCreating(true)}>{t('new')}</Button>
        </div>
      ) : null}

      {objectives.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              locale={locale}
              canManage={canManage}
              onEdit={() => setEditing(objective)}
              onDelete={() => setDeleting(objective)}
            />
          ))}
        </ul>
      )}

      <ObjectiveFormSheet
        open={(creating || editing !== null) && canManage}
        projectId={projectId}
        objective={editing}
        metrics={metrics}
        types={types}
        people={people}
        locale={locale}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (!deleting) return
          setError(null)
          try {
            await deleteObjective({ id: deleting.id })
            router.refresh()
          } catch {
            setError(t('form.failed'))
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function ObjectiveCard({
  objective,
  locale,
  canManage,
  onEdit,
  onDelete,
}: {
  objective: ObjectiveRow
  locale: Locale
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations('objectives')
  const tStatus = useTranslations('status.objective')
  const format = useFormatter()

  const gap = computeGap({
    targetValue: toNumber(objective.targetValue),
    currentValue: toNumber(objective.currentValue),
    direction: objective.metricDirection ?? 'higher_is_better',
    targetCurrency: objective.currency,
    // Until LOT 7 records results, the actual value carries the objective's own
    // currency: a result in another one is what ADR-024 refuses to compare.
    currentCurrency: objective.currentValue === null ? null : objective.currency,
  })

  const today = new Date().toISOString().slice(0, 10)
  const standing = periodStanding(objective, today)
  const elapsed = periodElapsedPercent(objective, today)
  const suggestion = suggestedStatus(gap, standing)

  const show = (value: string | null) => {
    const parsed = toNumber(value)
    if (parsed === null) return null
    const decimals = objective.metricDecimals ?? 0
    return objective.currency
      ? format.number(parsed, { style: 'currency', currency: objective.currency })
      : format.number(parsed, { maximumFractionDigits: decimals })
  }

  return (
    <li className="flex flex-col gap-3 rounded-doomee border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{objective.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-caption text-muted">
            {objective.objectiveTypeLabels?.[locale] ?? null}
            {objective.metricLabels?.[locale] ?? t('form.noMetric')}
          </span>
        </div>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <StatusBadge label={tStatus(objective.status)} tone={statusTone(objective.status)} />
          {canManage ? (
            <>
              <Button variant="secondary" onClick={onEdit}>
                {t('form.editTitle')}
              </Button>
              <Button variant="ghost" onClick={onDelete}>
                {t('delete.action')}
              </Button>
            </>
          ) : null}
        </span>
      </div>

      {/* Objectif → Réel → Écart, side by side, because the comparison is the
          point and three separate screens would hide it. */}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Cell label={t('columns.target')} value={show(objective.targetValue)} />
        <Cell label={t('columns.actual')} value={show(objective.currentValue)} />
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption uppercase tracking-wide text-subtle">{t('columns.gap')}</dt>
          <dd>
            <GapReading gap={gap} objective={objective} />
          </dd>
        </div>
      </dl>

      <p className="flex flex-wrap gap-3 text-caption text-subtle">
        <span>{t(`period.${standingKey(standing)}`)}</span>
        {elapsed === null ? null : <span>{t('gap.elapsed', { percent: elapsed })}</span>}
        {suggestion ? <span>{t('gap.suggested', { status: tStatus(suggestion) })}</span> : null}
      </p>
    </li>
  )
}

/**
 * The gap, in words.
 *
 * A currency mismatch is shown as an ERROR rather than as an absence: it is the
 * one case where the product could have produced a plausible number and
 * deliberately did not (ADR-024).
 */
function GapReading({ gap, objective }: { gap: Gap; objective: ObjectiveRow }) {
  const t = useTranslations('objectives.gap')
  const tone = gapTone(gap)

  if (!gap.computed) {
    if (gap.reason === 'currency_mismatch') {
      return (
        <Alert tone="error">
          {t('currencyMismatch', {
            target: objective.currency ?? '—',
            current: objective.currency ?? '—',
          })}
        </Alert>
      )
    }
    return <span className="text-label text-muted">{t(NOT_COMPUTED[gap.reason])}</span>
  }

  return (
    <span className="flex flex-col gap-0.5">
      <StatusBadge label={t(VERDICT_KEY[gap.verdict])} tone={tone === 'danger' ? 'danger' : tone} />
      <span className="text-caption text-muted tabular-nums">
        {t('achievement', { percent: gap.achievementPercent })}
      </span>
    </span>
  )
}

/** The message keys, as data: a lookup reads better than a nested ternary. */
const NOT_COMPUTED = {
  no_target: 'noTarget',
  no_result: 'noResult',
  zero_target: 'zeroTarget',
  currency_mismatch: 'currencyMismatch',
} as const

const VERDICT_KEY = { ahead: 'ahead', behind: 'behind', on_track: 'onTrack' } as const

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-label tabular-nums">{value ?? '—'}</dd>
    </div>
  )
}

function standingKey(standing: ReturnType<typeof periodStanding>) {
  if (standing === 'not_started') return 'notStarted'
  return standing
}
