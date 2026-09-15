import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, ProgressRing, StatusBadge } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { listPortalActivity, listPortalDeliverables, listPortalProjects } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

/**
 * The portal's first screen answers one question: **is anything waiting for
 * me?**
 *
 * A client opens this on a phone, between two other things. What they need is
 * not a dashboard — it is a yes or a no, and a way to act on the yes.
 */
export default async function PortalOverviewPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const [projects, deliverables, activity] = await Promise.all([
    listPortalProjects(),
    listPortalDeliverables({}),
    listPortalActivity({}),
  ])

  const t = await getTranslations('portal')
  const tActivity = await getTranslations('activity')
  const awaiting = deliverables.filter((item) => item.status === 'client_review')

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('overview.title')} description={t('overview.description')} />

      {/* The one yellow element on the screen, and it is the call to action. */}
      {awaiting.length > 0 ? (
        <Link
          href="/portal/deliverables"
          className="flex min-h-touch flex-col gap-1 rounded-doomee bg-doomee-yellow px-4 py-3 text-doomee-black"
        >
          <span className="font-semibold">{t('overview.awaiting')}</span>
          <span className="text-label">
            {t('overview.awaitingCount', { count: awaiting.length })}
          </span>
        </Link>
      ) : (
        <p className="text-label text-muted">{t('overview.nothingWaiting')}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('overview.projects')}</h2>
        {projects.length === 0 ? (
          <EmptyState title={t('projects.title')} description={t('projects.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/portal/projects/${project.id}` as '/portal'}
                  className="flex min-h-touch items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-2"
                >
                  <ProgressRing
                    value={project.progressPercent}
                    label={t('overview.progress', { percent: project.progressPercent })}
                    size={40}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{project.name}</span>
                    {project.clientName ? (
                      <span className="text-caption text-subtle">{project.clientName}</span>
                    ) : null}
                  </span>
                  {project.awaitingDecision > 0 ? (
                    <StatusBadge label={String(project.awaitingDecision)} tone="warning" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('overview.recent')}</h2>
        {activity.length === 0 ? (
          <p className="text-label text-muted">{t('overview.noActivity')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.map((event) => (
              <li
                key={event.id}
                className="rounded-doomee border border-border bg-surface px-3 py-2 text-label"
              >
                {tActivity(event.verb, {
                  actor: event.actorName ?? tActivity('unknownActor'),
                  name: String(event.params.name ?? ''),
                  version: String(event.params.version ?? ''),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
