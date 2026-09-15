import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, ProgressRing } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { listPortalProjects } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

export default async function PortalProjectsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const projects = await listPortalProjects()
  const t = await getTranslations('portal')

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('projects.title')} description={t('projects.description')} />

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
                  {project.description ? (
                    <span className="truncate text-caption text-subtle">{project.description}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
