'use client'

import { useTranslations } from 'next-intl'
import { timingOf } from '@/modules/actions/service'
import type { ActionRow } from '@/modules/actions/types'

/**
 * A deadline, read in the PROJECT's timezone (R9, ADR-039).
 *
 * The date alone is not the useful part: "overdue" is, and it is a different
 * answer for the same date depending on which project the action belongs to.
 */
export function DueDate({
  action,
}: {
  action: Pick<ActionRow, 'status' | 'dueDate' | 'timezone'>
}) {
  const t = useTranslations('actions.timing')
  const timing = timingOf(action, action.timezone, new Date())

  if (!action.dueDate) return <span className="text-muted">—</span>

  if (timing === 'overdue') {
    return (
      <span className="font-semibold text-danger-text">
        {action.dueDate} · {t('overdue')}
      </span>
    )
  }
  if (timing === 'today') {
    return (
      <span className="font-semibold">
        {action.dueDate} · {t('today')}
      </span>
    )
  }
  return <span className="text-muted">{action.dueDate}</span>
}
