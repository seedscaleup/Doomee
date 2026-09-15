'use client'

import { useTranslations } from 'next-intl'
import { type Column, DataTable, StatusBadge } from '@/components/patterns'
import { useRouter } from '@/i18n/navigation'
import { statusTone } from '@/modules/actions/service'
import type { ActionRow } from '@/modules/actions/types'
import { DueDate } from './due-date'

export function ActionList({ rows, caption }: { rows: ActionRow[]; caption: string }) {
  const t = useTranslations('actions')
  const tStatus = useTranslations('status.action')
  const router = useRouter()

  const columns: Column<ActionRow>[] = [
    {
      key: 'title',
      header: t('columns.title'),
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => <StatusBadge label={tStatus(row.status)} tone={statusTone(row.status)} />,
    },
    {
      key: 'project',
      header: t('columns.project'),
      cell: (row) => row.projectName,
      secondary: true,
    },
    {
      key: 'assignee',
      header: t('columns.assignee'),
      cell: (row) => row.assigneeName ?? t('unassigned'),
      secondary: true,
    },
    {
      key: 'dueDate',
      header: t('columns.dueDate'),
      cell: (row) => <DueDate action={row} />,
      secondary: true,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      onRowClick={(row) => router.push(`/app/actions/${row.id}` as '/app')}
      caption={caption}
    />
  )
}
