'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { EmptyState, PageHeader, StatusBadge } from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { Link } from '@/i18n/navigation'
import { bucketByTiming, canFocus, focusSelection, statusTone } from '@/modules/actions/service'
import type { ActionRow } from '@/modules/actions/types'
import { DueDate } from '../actions/due-date'
import { FocusMode } from './focus-mode'

const BUCKETS = ['overdue', 'today', 'soon', 'later'] as const

/**
 * My Work — the same rows as the action list, cut into the three questions
 * people actually ask: what is late, what is today, what is coming.
 *
 * The cutting is done by the pure service, so this screen and Focus Mode agree
 * on what "urgent" means rather than each having an opinion.
 */
export function MyWorkScreen({
  rows,
  labels,
}: {
  rows: ActionRow[]
  labels: { title: string; description: string }
}) {
  const t = useTranslations('myWork')
  const tStatus = useTranslations('status.action')
  const [focusing, setFocusing] = useState(false)

  /**
   * Each action is judged against ITS OWN project's timezone, which is why the
   * buckets are built per project rather than against one clock: someone can
   * legitimately work across Abidjan and Paris on the same morning (ADR-039).
   */
  const buckets = useMemo(() => {
    const now = new Date()
    const byZone = new Map<string, ActionRow[]>()
    for (const row of rows) {
      byZone.set(row.timezone, [...(byZone.get(row.timezone) ?? []), row])
    }

    const merged = {
      overdue: [] as ActionRow[],
      today: [] as ActionRow[],
      soon: [] as ActionRow[],
      later: [] as ActionRow[],
    }
    for (const [timezone, group] of byZone) {
      const cut = bucketByTiming(group, timezone, now)
      merged.overdue.push(...cut.overdue)
      merged.today.push(...cut.today)
      merged.soon.push(...cut.soon)
      merged.later.push(...cut.later)
    }
    return merged
  }, [rows])

  const focus = useMemo(() => focusSelection(rows, rows[0]?.timezone ?? 'UTC', new Date()), [rows])

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader title={labels.title} description={labels.description} />
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={labels.title}
        description={labels.description}
        action={
          canFocus(rows.length) ? (
            <Button onClick={() => setFocusing(true)}>{t('focus.enter')}</Button>
          ) : undefined
        }
      />

      {BUCKETS.map((bucket) =>
        buckets[bucket].length === 0 ? null : (
          <section key={bucket} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-section">
              {t(`buckets.${bucket}`)}
              <span className="text-caption text-subtle tabular-nums">
                {t('count', { count: buckets[bucket].length })}
              </span>
            </h2>

            <ul className="flex flex-col gap-2">
              {buckets[bucket].map((action) => (
                <li key={action.id}>
                  <Link
                    href={`/app/actions/${action.id}` as '/app'}
                    className="flex min-h-touch flex-wrap items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{action.title}</span>
                      <span className="text-caption text-muted">{action.projectName}</span>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={tStatus(action.status)}
                        tone={statusTone(action.status)}
                      />
                      <DueDate action={action} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      <FocusMode open={focusing} actions={focus} onClose={() => setFocusing(false)} />
    </section>
  )
}
