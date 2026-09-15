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
import type { Locale } from '@/i18n/routing'
import { normaliseSearch } from '@/modules/clients/service'
// The barrel is a SERVER entrypoint (ADR-030): take the pure service and the
// shared types instead.
import { statusTone } from '@/modules/deliverables/service'
import type {
  DeliverableRow,
  PersonOption,
  ProjectOption,
  TaxonomyOption,
} from '@/modules/deliverables/types'
import { DeliverableFormSheet } from './deliverable-form-sheet'

const STATUSES = [
  'draft',
  'production',
  'internal_review',
  'client_review',
  'changes_requested',
  'approved',
  'published',
] as const

export function DeliverablesScreen({
  rows,
  projects,
  types,
  owners,
  locale,
  canCreate,
  labels,
}: {
  rows: DeliverableRow[]
  projects: ProjectOption[]
  types: TaxonomyOption[]
  owners: PersonOption[]
  locale: Locale
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canCreate: boolean
  labels: { title: string; description: string }
}) {
  const t = useTranslations('deliverables')
  const tStatus = useTranslations('status.deliverable')
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
      return normaliseSearch(`${row.title} ${row.projectName}`).includes(needle)
    })
  }, [rows, search, status])

  const columns: Column<DeliverableRow>[] = [
    {
      key: 'title',
      header: t('form.name'),
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'status',
      header: t('filters.status'),
      cell: (row) => <StatusBadge label={tStatus(row.status)} tone={statusTone(row.status)} />,
    },
    {
      key: 'project',
      header: t('form.project'),
      cell: (row) => <span className="text-muted">{row.projectName}</span>,
    },
    {
      key: 'version',
      header: t('versions.title'),
      cell: (row) => (
        <span className="tabular-nums text-muted">
          {row.currentVersion === null
            ? t('noVersion')
            : t('currentVersion', { version: row.currentVersion })}
        </span>
      ),
    },
    {
      key: 'dueDate',
      header: t('form.dueDate'),
      cell: (row) => <span className="tabular-nums text-muted">{row.dueDate ?? '—'}</span>,
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
            key: 'status',
            label: t('filters.status'),
            value: status,
            options: [
              { value: 'all', label: t('filters.all') },
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
        onRowClick={(row) => router.push(`/app/deliverables/${row.id}` as '/app')}
        caption={labels.title}
        emptyState={
          rows.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          ) : (
            <EmptyState title={t('noneForFilter')} description={tCommon('none')} />
          )
        }
      />

      <DeliverableFormSheet
        open={creating && canCreate}
        projects={projects}
        types={types}
        owners={owners}
        locale={locale}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          router.refresh()
        }}
      />
    </section>
  )
}
