'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  StatusBadge,
} from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { normaliseSearch } from '@/modules/clients/service'
// The barrel is a SERVER entrypoint (ADR-030): the pure service and the shared
// types are what a client component may take.
import { statusTone } from '@/modules/reports/service'
import type { ClientOption, ProjectOption, ReportRow } from '@/modules/reports/types'
import { ReportWizard } from './report-wizard'

export function ReportsScreen({
  rows,
  projects,
  clients,
  canCreate,
  defaultLocale,
  labels,
}: {
  rows: ReportRow[]
  projects: ProjectOption[]
  clients: ClientOption[]
  canCreate: boolean
  defaultLocale: 'fr' | 'en'
  labels: { title: string; description: string }
}) {
  const t = useTranslations('reports')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const needle = normaliseSearch(search)
    return rows.filter((row) => {
      if (projectId !== 'all' && row.projectId !== projectId) return false
      if (status !== 'all' && row.status !== status) return false
      if (!needle) return true
      return normaliseSearch(
        `${row.title} ${row.projectName ?? ''} ${row.clientName ?? ''}`,
      ).includes(needle)
    })
  }, [rows, search, projectId, status])

  const columns: Column<ReportRow>[] = [
    {
      key: 'title',
      header: t('columns.title'),
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'type',
      header: t('columns.type'),
      cell: (row) => <span className="text-muted">{t(`types.${asType(row.type)}`)}</span>,
    },
    {
      key: 'scope',
      header: t('columns.scope'),
      cell: (row) => <span className="text-muted">{row.projectName ?? row.clientName ?? '—'}</span>,
    },
    {
      key: 'period',
      header: t('columns.period'),
      cell: (row) => (
        <span className="text-muted tabular-nums">
          {row.periodStart} → {row.periodEnd}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusBadge label={t(`statuses.${row.status}`)} tone={statusTone(row.status)} />
      ),
    },
    {
      key: 'shares',
      header: t('columns.shares'),
      cell: (row) => <span className="tabular-nums text-muted">{row.shareCount}</span>,
    },
  ]

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
        searchLabel={t('filters.search')}
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: 'project',
            label: t('filters.project'),
            value: projectId,
            options: [
              { value: 'all', label: t('filters.all') },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ],
          },
          {
            key: 'status',
            label: t('filters.status'),
            value: status,
            options: [
              { value: 'all', label: t('filters.all') },
              ...STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) })),
            ],
          },
        ]}
        onFilterChange={(key, value) =>
          key === 'project' ? setProjectId(value) : setStatus(value)
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/app/reports/${row.id}` as '/app')}
        caption={labels.title}
        emptyState={
          rows.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          ) : (
            <EmptyState title={t('noneForFilter')} description={tCommon('none')} />
          )
        }
      />

      <ReportWizard
        open={creating && canCreate}
        projects={projects}
        clients={clients}
        defaultLocale={defaultLocale}
        onClose={() => setCreating(false)}
      />
    </section>
  )
}

const STATUSES = ['draft', 'in_review', 'published', 'archived'] as const

const TYPES = [
  'weekly_internal',
  'monthly',
  'project',
  'client',
  'campaign_review',
  'period_review',
] as const

/** The column is `text` to the row type; the catalogue only has the six. */
function asType(value: string): (typeof TYPES)[number] {
  return TYPES.find((type) => type === value) ?? 'monthly'
}
