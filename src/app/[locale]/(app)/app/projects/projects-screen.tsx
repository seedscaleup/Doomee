'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  ProgressRing,
  StatusBadge,
} from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { normaliseSearch } from '@/modules/clients/service'
// The barrel is a SERVER entrypoint (ADR-030): take the pure service and the
// shared types instead.
import { statusTone } from '@/modules/projects/service'
import type { ClientOption, ColleagueOption, ProjectRow } from '@/modules/projects/types'
import { ProjectFormSheet } from './project-form-sheet'

const STATUSES = ['to_start', 'in_progress', 'in_review', 'paused', 'blocked', 'done'] as const

export function ProjectsScreen({
  rows,
  clients,
  colleagues,
  canCreate,
  labels,
}: {
  rows: ProjectRow[]
  clients: ClientOption[]
  colleagues: ColleagueOption[]
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canCreate: boolean
  labels: { title: string; description: string }
}) {
  const t = useTranslations('projects')
  const tStatus = useTranslations('status.project')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const needle = normaliseSearch(search)
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (!needle) return true
      return normaliseSearch(`${row.name} ${row.code ?? ''}`).includes(needle)
    })
  }, [rows, search, status])

  const columns: Column<ProjectRow>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => <StatusBadge label={tStatus(row.status)} tone={statusTone(row.status)} />,
    },
    {
      key: 'client',
      header: t('columns.client'),
      cell: (row) => row.clientName ?? t('noClient'),
      secondary: true,
    },
    {
      key: 'owner',
      header: t('columns.owner'),
      cell: (row) => row.ownerName ?? '—',
      secondary: true,
    },
    {
      key: 'progress',
      header: t('columns.progress'),
      cell: (row) => (
        <ProgressRing
          value={row.progressPercent}
          label={t('progress.value', { percent: row.progressPercent })}
          size={36}
        />
      ),
      secondary: true,
      align: 'end',
    },
  ]

  const empty =
    rows.length === 0 ? (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={
          canCreate ? <Button onClick={() => setCreating(true)}>{t('new')}</Button> : undefined
        }
      />
    ) : (
      <EmptyState title={t('noResultsTitle')} description={t('noResultsDescription')} />
    )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={labels.title}
        description={labels.description}
        action={
          canCreate ? <Button onClick={() => setCreating(true)}>{t('new')}</Button> : undefined
        }
      />

      <FilterBar
        searchLabel={t('searchPlaceholder')}
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: 'status',
            label: t('statusFilter'),
            value: status,
            options: [
              { value: 'all', label: tCommon('all') },
              ...STATUSES.map((value) => ({ value, label: tStatus(value) })),
            ],
          },
        ]}
        onFilterChange={(_key, value) => setStatus(value)}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/app/projects/${row.id}` as '/app')}
        caption={labels.title}
        emptyState={empty}
      />

      <ProjectFormSheet
        open={creating && canCreate}
        clients={clients}
        colleagues={colleagues}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          router.refresh()
        }}
      />
    </section>
  )
}
