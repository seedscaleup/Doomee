'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { EmptyState, FilterBar, PageHeader } from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import type { ActionRow, PersonOption, ProjectOption } from '@/modules/actions/types'
import { normaliseSearch } from '@/modules/clients/service'
import { ActionBoard } from './action-board'
import { ActionList } from './action-list'
import { QuickCreateSheet } from './quick-create-sheet'

const STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const
const VIEWS = ['list', 'board'] as const

export function ActionsScreen({
  rows,
  projects,
  people,
  canCreate,
  labels,
}: {
  rows: ActionRow[]
  projects: ProjectOption[]
  people: PersonOption[]
  canCreate: boolean
  labels: { title: string; description: string }
}) {
  const t = useTranslations('actions')
  const tStatus = useTranslations('status.action')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [view, setView] = useState<(typeof VIEWS)[number]>('list')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const needle = normaliseSearch(search)
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (!needle) return true
      return normaliseSearch(`${row.title} ${row.projectName}`).includes(needle)
    })
  }, [rows, search, status])

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
          {
            key: 'view',
            label: t('viewFilter'),
            value: view,
            options: VIEWS.map((value) => ({ value, label: t(`views.${value}`) })),
          },
        ]}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value)
          if (key === 'view') setView(value === 'board' ? 'board' : 'list')
        }}
      />

      {filtered.length === 0 ? (
        empty
      ) : view === 'board' ? (
        <ActionBoard rows={filtered} />
      ) : (
        <ActionList rows={filtered} caption={labels.title} />
      )}

      <QuickCreateSheet
        open={creating && canCreate}
        projects={projects}
        people={people}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          router.refresh()
        }}
      />
    </section>
  )
}
