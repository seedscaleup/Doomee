import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, ProgressRing } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import {
  getPortalProject,
  listPortalComments,
  listPortalDeliverables,
  listPortalObjectives,
} from '@/modules/portal'
import { requirePortalPageSession } from '@/server'
import { PortalThread } from '../../messages/portal-thread'

export default async function PortalProjectPage(props: {
  params: Promise<{ locale: string; projectId: string }>
}) {
  const { locale, projectId } = await props.params
  await requirePortalPageSession(locale)

  const project = await getPortalProject({ id: projectId })
  if (!project) notFound()

  const [objectives, deliverables, comments] = await Promise.all([
    listPortalObjectives({ projectId }),
    listPortalDeliverables({ projectId }),
    listPortalComments({ entityType: 'project', entityId: projectId }),
  ])

  const t = await getTranslations('portal')
  const tMessages = await getTranslations('portal.messages')
  const readable: Locale = locale === 'en' ? 'en' : 'fr'

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/portal/projects"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {t('projects.back')}
      </Link>

      <PageHeader title={project.name} description={project.description ?? undefined} />

      <div className="flex items-center gap-3">
        <ProgressRing
          value={project.progressPercent}
          label={t('overview.progress', { percent: project.progressPercent })}
          size={56}
        />
        {project.clientName ? (
          <span className="text-label text-muted">{project.clientName}</span>
        ) : null}
      </div>

      {/* Objectives, because a portal that shows activity without showing what
          it pursues is a task list — which is what Doomee refuses to be
          (ADR-048). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('projects.objectives')}</h2>
        {objectives.length === 0 ? (
          <p className="text-label text-muted">{t('projects.noObjectives')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {objectives.map((objective) => (
              <li
                key={objective.id}
                className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-2"
              >
                <span className="font-medium">{objective.title}</span>
                <span className="flex flex-wrap gap-4 text-caption text-subtle">
                  <span>
                    {t('projects.target')} : {objective.targetValue ?? '—'}
                  </span>
                  <span>
                    {t('projects.actual')} : {objective.currentValue ?? '—'}
                  </span>
                  {objective.metricLabels ? (
                    <span>{objective.metricLabels[readable] ?? ''}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('deliverables.title')}</h2>
        {deliverables.length === 0 ? (
          <EmptyState title={t('deliverables.title')} description={t('deliverables.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {deliverables.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/portal/deliverables/${row.id}` as '/portal'}
                  className="flex min-h-touch items-center rounded-doomee border border-border bg-surface px-3 py-2 text-label"
                >
                  {row.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{tMessages('title')}</h2>
        <PortalThread
          entityType="project"
          entityId={project.id}
          comments={comments}
          labels={{
            empty: tMessages('empty'),
            placeholder: tMessages('placeholder'),
            send: tMessages('send'),
            failed: tMessages('failed'),
            onlyShared: tMessages('onlyShared'),
          }}
        />
      </section>
    </section>
  )
}
