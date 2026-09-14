'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  AvatarStack,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  PriorityChip,
  ProgressRing,
  SheetForm,
  StatusBadge,
  Timeline,
} from '@/components/patterns'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { Skeleton, SkeletonList } from '@/components/ui/skeleton'

type DemoRow = { id: string; name: string; status: string; owner: string }

const ROWS: DemoRow[] = [
  { id: '1', name: 'Campagne rentrée', status: 'in_progress', owner: 'Sandra Kouamé' },
  { id: '2', name: 'Refonte du site', status: 'in_review', owner: 'Mike Aka' },
  { id: '3', name: 'Bilan trimestriel', status: 'done', owner: 'Mercedes Diallo' },
]

export function DesignGallery() {
  const t = useTranslations('devDesign')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')
  const tPriority = useTranslations('priority')
  const [search, setSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const columns: Column<DemoRow>[] = [
    { key: 'name', header: t('sections.table'), cell: (row) => row.name },
    {
      key: 'status',
      header: t('sections.badges'),
      cell: (row) => (
        <StatusBadge label={row.status} tone={row.status === 'done' ? 'success' : 'progress'} />
      ),
    },
    { key: 'owner', header: t('sections.avatars'), cell: (row) => row.owner, secondary: true },
  ]

  return (
    <div className="flex flex-col gap-10">
      <Section title={t('sections.header')}>
        <PageHeader
          // A sample, not the page's own heading: the gallery already has an h1.
          as="h3"
          title={t('demo.projectTitle')}
          description={t('demo.projectDescription')}
          action={<Button>{t('demo.primaryAction')}</Button>}
        />
      </Section>

      <Section title={t('sections.buttons')}>
        <div className="flex flex-wrap gap-2">
          <Button>{t('demo.primaryAction')}</Button>
          <Button variant="secondary">{tCommon('cancel')}</Button>
          <Button variant="danger">{tCommon('delete')}</Button>
          <Button variant="ghost">{tCommon('close')}</Button>
          <Button disabled>{t('demo.primaryAction')}</Button>
        </div>
      </Section>

      <Section title={t('sections.fields')}>
        <div className="flex max-w-sm flex-col gap-4">
          <Field label={t('demo.fieldLabel')} hint={t('demo.fieldHint')}>
            {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} />}
          </Field>
          <Field label={t('demo.selectLabel')} error={t('demo.fieldError')}>
            {({ id }) => (
              <Select id={id}>
                <option>{tCommon('all')}</option>
              </Select>
            )}
          </Field>
          <Alert tone="error">{t('demo.fieldError')}</Alert>
          <Alert tone="success">{t('demo.successMessage')}</Alert>
        </div>
      </Section>

      <Section title={t('sections.badges')}>
        <div className="flex flex-wrap items-center gap-3">
          {/* Statuses are enums; their labels live in the catalogues (ADR-010). */}
          <StatusBadge label={tStatus('project.to_start')} />
          <StatusBadge label={tStatus('project.in_progress')} tone="progress" />
          <StatusBadge label={tStatus('project.done')} tone="success" />
          <StatusBadge label={tStatus('project.blocked')} tone="danger" />
          <StatusBadge label={tStatus('health.at_risk')} tone="warning" />
          {(['low', 'normal', 'high', 'urgent'] as const).map((level) => (
            <PriorityChip key={level} level={level} label={tPriority(level)} />
          ))}
        </div>
      </Section>

      <Section title={t('sections.progress')}>
        <div className="flex flex-wrap items-center gap-4">
          <ProgressRing value={0} label={t('demo.progressLabel')} />
          <ProgressRing value={38} label={t('demo.progressLabel')} />
          <ProgressRing value={84} label={t('demo.progressLabel')} />
          <ProgressRing value={100} label={t('demo.progressLabel')} />
        </div>
      </Section>

      <Section title={t('sections.avatars')}>
        <AvatarStack
          names={['Sandra Kouamé', 'Mike Aka', 'Mercedes Diallo', 'Awa Traoré', 'Yao N’Guessan']}
        />
      </Section>

      <Section title={t('sections.filters')}>
        <FilterBar
          searchLabel={tCommon('search')}
          searchValue={search}
          onSearchChange={setSearch}
        />
      </Section>

      <Section title={t('sections.table')}>
        <DataTable
          rows={ROWS}
          columns={columns}
          getRowKey={(row) => row.id}
          caption={t('sections.table')}
        />
      </Section>

      <Section title={t('sections.empty')}>
        <EmptyState
          title={t('demo.emptyTitle')}
          description={t('demo.emptyDescription')}
          action={<Button>{t('demo.primaryAction')}</Button>}
        />
      </Section>

      <Section title={t('sections.timeline')}>
        <Timeline
          entries={[
            {
              id: 'a',
              content: t('demo.timelineDone'),
              timestamp: '14/09/2026 10:32',
              tone: 'success',
            },
            { id: 'b', content: t('demo.timelineAdded'), timestamp: '14/09/2026 09:14' },
            {
              id: 'c',
              content: t('demo.timelineRisk'),
              timestamp: '13/09/2026 17:02',
              tone: 'warning',
            },
          ]}
        />
      </Section>

      <Section title={t('sections.overlays')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            {t('demo.openSheet')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            {t('demo.openConfirm')}
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          title={t('demo.confirmTitle')}
          description={t('demo.confirmDescription')}
          confirmLabel={tCommon('delete')}
          cancelLabel={tCommon('cancel')}
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />

        <SheetForm
          open={sheetOpen}
          title={t('demo.sheetTitle')}
          submitLabel={tCommon('save')}
          cancelLabel={tCommon('cancel')}
          pendingLabel={tCommon('loading')}
          onSubmit={async () => setSheetOpen(false)}
          onCancel={() => setSheetOpen(false)}
        >
          <Field label={t('demo.fieldLabel')}>
            {({ id }) => <TextInput id={id} name="demo" />}
          </Field>
        </SheetForm>
      </Section>

      <Section title={t('sections.loading')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
          {/* The fallback for an in-page <Suspense>, which is where waiting is
              shown now that no route-level loading.tsx sits above a page that
              can answer 404 (ADR-033). */}
          <SkeletonList rows={2} label={tCommon('loading')} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-caption font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  )
}
