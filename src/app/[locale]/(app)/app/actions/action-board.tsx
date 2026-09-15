'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { StatusBadge } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { groupByStatus, KANBAN_COLUMNS, statusTone } from '@/modules/actions/service'
import type { ActionRow } from '@/modules/actions/types'
import { DueDate } from './due-date'

/**
 * The kanban: one column per status, most urgent first inside each.
 *
 * Read-only at this lot. Dragging a card between columns is the same call the
 * detail screen makes, and adding it before the order inside a column is stored
 * would mean storing a position nobody chose.
 */
export function ActionBoard({ rows }: { rows: ActionRow[] }) {
  const t = useTranslations('actions')
  const tStatus = useTranslations('status.action')

  // Every card shows a deadline judged in its own project's timezone, so the
  // grouping is done per row rather than against one clock.
  const grouped = useMemo(() => groupByStatus(rows, rows[0]?.timezone ?? 'UTC', new Date()), [rows])

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-max gap-4">
        {KANBAN_COLUMNS.map((column) => (
          <section key={column} className="flex w-72 flex-col gap-2" aria-label={tStatus(column)}>
            <header className="flex items-center justify-between">
              <StatusBadge label={tStatus(column)} tone={statusTone(column)} />
              <span className="text-caption text-subtle tabular-nums">
                {grouped[column].length}
              </span>
            </header>

            <ul className="flex flex-col gap-2">
              {grouped[column].map((action) => (
                <li key={action.id}>
                  <Link
                    href={`/app/actions/${action.id}` as '/app'}
                    className="flex min-h-touch flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-2"
                  >
                    <span className="font-medium">{action.title}</span>
                    <span className="text-caption text-muted">{action.projectName}</span>
                    <span className="text-caption">
                      <DueDate action={action} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {grouped[column].length === 0 ? (
              <p className="rounded-doomee border border-dashed border-border px-3 py-4 text-caption text-subtle">
                {t('noResultsTitle')}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  )
}
