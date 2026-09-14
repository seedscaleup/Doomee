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
// The module barrel is a SERVER entrypoint (ADR-030): a client component
// takes the pure service and the shared types instead.
import { normaliseSearch, statusTone } from '@/modules/clients/service'
import type { ClientRow, IndustryOption } from '@/modules/clients/types'
import { ClientFormSheet } from './client-form-sheet'

const STATUSES = ['prospect', 'active', 'paused', 'archived'] as const

export function ClientsScreen({
  rows,
  industries,
  locale,
  labels,
}: {
  rows: ClientRow[]
  industries: IndustryOption[]
  locale: Locale
  labels: { title: string; description: string }
}) {
  const t = useTranslations('clients')
  const tStatus = useTranslations('status.client')
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
      return normaliseSearch(row.name).includes(needle)
    })
  }, [rows, search, status])

  const columns: Column<ClientRow>[] = [
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
      key: 'industry',
      header: t('columns.industry'),
      cell: (row) => row.industryLabels?.[locale] ?? '—',
      secondary: true,
    },
    {
      key: 'owner',
      header: t('columns.owner'),
      cell: (row) => row.ownerName ?? '—',
      secondary: true,
    },
    {
      key: 'contacts',
      header: t('columns.contacts'),
      cell: (row) => row.contactCount,
      secondary: true,
      align: 'end',
    },
  ]

  // Nothing at all versus nothing matching are different situations and deserve
  // different words: one invites a first client, the other suggests a fix.
  const empty =
    rows.length === 0 ? (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        action={<Button onClick={() => setCreating(true)}>{t('new')}</Button>}
      />
    ) : (
      <EmptyState title={t('noResultsTitle')} description={t('noResultsDescription')} />
    )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={labels.title}
        description={labels.description}
        action={<Button onClick={() => setCreating(true)}>{t('new')}</Button>}
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
        onRowClick={(row) => router.push(`/app/clients/${row.id}` as '/app')}
        caption={labels.title}
        emptyState={empty}
      />

      <ClientFormSheet
        open={creating}
        industries={industries}
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
