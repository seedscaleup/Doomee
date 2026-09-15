'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  ConfirmDialog,
  EmptyState,
  type LoopStageView,
  LoopStrip,
  PageHeader,
  ProgressRing,
  StatusBadge,
  Tabs,
  Timeline,
  type TimelineEntry,
} from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import type { MetricOption, ObjectiveRow, TaxonomyOption } from '@/modules/objectives/types'
import { archiveProject } from '@/modules/projects/mutations'
import { daysUntil, isOverdue, priorityTone, statusTone } from '@/modules/projects/service'
import type {
  ClientOption,
  ColleagueOption,
  MilestoneRow,
  ProjectDetail,
  ProjectMemberRow,
} from '@/modules/projects/types'
import { ProjectFormSheet } from '../project-form-sheet'
import { MembersPanel } from './members-panel'
import { MilestonesPanel } from './milestones-panel'
import { ObjectivesPanel } from './objectives-panel'

type ActivityEntry = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}

const TABS = ['overview', 'objectives', 'members', 'milestones', 'activity'] as const
type Tab = (typeof TABS)[number]

export function ProjectDetailScreen({
  project,
  members,
  milestones,
  objectives,
  metrics,
  objectiveTypes,
  locale,
  clients,
  colleagues,
  activity,
  loop,
  canManage,
  backLabel,
}: {
  project: ProjectDetail
  members: ProjectMemberRow[]
  milestones: MilestoneRow[]
  objectives: ObjectiveRow[]
  metrics: MetricOption[]
  objectiveTypes: TaxonomyOption[]
  locale: Locale
  clients: ClientOption[]
  colleagues: ColleagueOption[]
  activity: ActivityEntry[]
  /** Where this project stands in the central loop (LOT 10). */
  loop: { stages: LoopStageView[]; caption: string }
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canManage: boolean
  backLabel: string
}) {
  const t = useTranslations('projects')
  const tActivity = useTranslations('activity')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const entries: TimelineEntry[] = activity.map((entry) => ({
    id: entry.id,
    content: tActivity(entry.verb, {
      actor: entry.actorName ?? tActivity('unknownActor'),
      name: String(entry.params.name ?? project.name),
    }),
    timestamp: format.dateTime(new Date(entry.createdAt), {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  }))

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/app/projects"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {backLabel}
      </Link>

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {tCommon('save')}
              </Button>
              {project.status !== 'archived' ? (
                <Button variant="ghost" onClick={() => setArchiving(true)}>
                  {t('archive.action')}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <ProjectSummary project={project} />

      <Tabs
        tabs={TABS.map((name) => ({ key: name, label: t(`tabs.${name}`) }))}
        active={tab}
        onSelect={setTab}
        label={project.name}
      />

      {tab === 'overview' ? (
        <div className="flex flex-col gap-6">
          {/* The product's own diagram, filled in with this project's counts —
              and pointing at the step where the loop currently stops. */}
          <LoopStrip stages={loop.stages} label={t('loop')} caption={loop.caption} />
          <Overview project={project} />
        </div>
      ) : null}

      {tab === 'objectives' ? (
        <ObjectivesPanel
          projectId={project.id}
          objectives={objectives}
          metrics={metrics}
          types={objectiveTypes}
          people={colleagues.map((colleague) => ({
            userId: colleague.userId,
            name: colleague.name,
          }))}
          locale={locale}
          canManage={canManage}
        />
      ) : null}

      {tab === 'members' ? (
        <MembersPanel
          projectId={project.id}
          members={members}
          colleagues={colleagues}
          canManage={canManage}
        />
      ) : null}

      {tab === 'milestones' ? (
        <MilestonesPanel
          projectId={project.id}
          milestones={milestones}
          timezone={project.timezone}
          canManage={canManage}
        />
      ) : null}

      {tab === 'activity' ? (
        entries.length > 0 ? (
          <Timeline entries={entries} />
        ) : (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        )
      ) : null}

      <ProjectFormSheet
        open={editing && canManage}
        project={{
          id: project.id,
          name: project.name,
          code: project.code,
          clientId: project.clientId,
          description: project.description,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          ownerUserId: project.ownerUserId,
          budgetAmount: project.budgetAmount,
          budgetCurrency: project.budgetCurrency,
          isClientVisible: project.isClientVisible,
        }}
        clients={clients}
        colleagues={colleagues}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={archiving}
        title={t('archive.title')}
        description={t('archive.description')}
        confirmLabel={t('archive.confirm')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          await archiveProject({ id: project.id })
          setArchiving(false)
          router.refresh()
        }}
        onCancel={() => setArchiving(false)}
      />
    </section>
  )
}

function Overview({ project }: { project: ProjectDetail }) {
  const t = useTranslations('projects')
  const tCommon = useTranslations('common')
  const format = useFormatter()

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Detail label={t('form.client')} value={project.clientName ?? t('noClient')} />
      <Detail label={t('form.owner')} value={project.ownerName} />
      <Detail label={t('form.code')} value={project.code} />
      <Detail label={t('form.startDate')} value={project.startDate} />
      <Detail label={t('form.endDate')} value={project.endDate} />
      <Detail label={t('form.timezone')} value={project.timezone} />
      {/* Amount and currency are shown together, always. Never summed with
          another currency (ADR-024). */}
      <Detail
        label={t('form.budgetAmount')}
        value={
          project.budgetAmount && project.budgetCurrency
            ? format.number(Number(project.budgetAmount), {
                style: 'currency',
                currency: project.budgetCurrency,
              })
            : null
        }
      />
      <Detail
        label={t('form.isClientVisible')}
        value={project.isClientVisible ? tCommon('confirm') : tCommon('none')}
      />
    </dl>
  )
}

/**
 * The three questions a project screen exists to answer at a glance: where is
 * it, how far along, and when is it due.
 */
function ProjectSummary({ project }: { project: ProjectDetail }) {
  const t = useTranslations('projects')
  const tStatus = useTranslations('status.project')
  const tPriority = useTranslations('priority')

  return (
    <div className="flex flex-wrap items-center gap-4">
      <ProgressRing
        value={project.progressPercent}
        label={t('progress.value', { percent: project.progressPercent })}
        size={56}
      />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={tStatus(project.status)} tone={statusTone(project.status)} />
          <StatusBadge label={tPriority(project.priority)} tone={priorityTone(project.priority)} />
          <span className="text-label text-muted">{project.clientName ?? t('noClient')}</span>
        </div>
        <Deadline endDate={project.endDate} timezone={project.timezone} />
      </div>
    </div>
  )
}

/**
 * The deadline, read in the PROJECT's timezone (R9).
 *
 * A deadline of the 15th is not late at 23:00 on the 14th in Abidjan just
 * because the reader happens to be in Paris.
 */
function Deadline({ endDate, timezone }: { endDate: string | null; timezone: string }) {
  const t = useTranslations('projects.deadline')
  if (!endDate) return <span className="text-label text-muted">{t('none')}</span>

  const now = new Date()
  const days = daysUntil(endDate, timezone, now) ?? 0

  if (isOverdue(endDate, timezone, now)) {
    return (
      <span className="text-label font-semibold text-danger-text">
        {t('overdue', { days: -days })}
      </span>
    )
  }
  if (days === 0) return <span className="text-label font-semibold">{t('today')}</span>
  return <span className="text-label text-muted">{t('remaining', { days })}</span>
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-label">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  )
}
