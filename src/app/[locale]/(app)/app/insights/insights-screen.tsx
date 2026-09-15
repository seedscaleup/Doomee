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
// The barrel is a SERVER entrypoint (ADR-030): take the pure service and the
// shared types instead.
import { isSubstantiated } from '@/modules/insights/service'
import type {
  ClientOption,
  InsightRow,
  ProjectOption,
  ResultOption,
} from '@/modules/insights/types'
import { InsightFormSheet, type InsightSource } from './insight-form-sheet'

export function InsightsScreen({
  rows,
  projects,
  clients,
  results,
  canCreate,
  fromResult,
  labels,
}: {
  rows: InsightRow[]
  projects: ProjectOption[]
  clients: ClientOption[]
  results: ResultOption[]
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canCreate: boolean
  /** Set when the page was opened from a result, to pre-fill the form. */
  fromResult: InsightSource | null
  labels: { title: string; description: string }
}) {
  const t = useTranslations('insights')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('all')
  // Arriving from a result opens the form straight away: the reader already
  // said what they wanted by clicking the link.
  const [creating, setCreating] = useState(fromResult !== null)

  const filtered = useMemo(() => {
    const needle = normaliseSearch(search)
    return rows.filter((row) => {
      if (projectId !== 'all' && row.projectId !== projectId) return false
      if (!needle) return true
      return normaliseSearch(
        `${row.title} ${row.whatWeLearned ?? ''} ${row.recommendation ?? ''}`,
      ).includes(needle)
    })
  }, [rows, search, projectId])

  const columns: Column<InsightRow>[] = [
    {
      key: 'title',
      header: t('columns.title'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.title}</span>
          {/* A title and four empty boxes is a meeting that happened, not a
              finding. The list says which ones are still that. */}
          {isSubstantiated(row) ? null : (
            <StatusBadge label={t('unsubstantiated')} tone="neutral" />
          )}
        </span>
      ),
    },
    {
      key: 'project',
      header: t('columns.project'),
      cell: (row) => <span className="text-muted">{row.projectName ?? row.clientName ?? '—'}</span>,
    },
    {
      key: 'results',
      header: t('columns.results'),
      cell: (row) => <span className="tabular-nums text-muted">{row.resultCount}</span>,
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) => (
        // The number that says whether the loop closed on this insight.
        <StatusBadge
          label={String(row.actionCount)}
          tone={row.actionCount > 0 ? 'success' : 'neutral'}
        />
      ),
    },
    {
      key: 'author',
      header: t('columns.author'),
      cell: (row) => <span className="text-muted">{row.authorName ?? '—'}</span>,
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
        ]}
        onFilterChange={(_key, value) => setProjectId(value)}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/app/insights/${row.id}` as '/app')}
        caption={labels.title}
        emptyState={
          rows.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          ) : (
            <EmptyState title={t('noneForFilter')} description={tCommon('none')} />
          )
        }
      />

      <InsightFormSheet
        open={creating && canCreate}
        projects={projects}
        clients={clients}
        results={results}
        source={fromResult ?? undefined}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          router.refresh()
        }}
      />
    </section>
  )
}
