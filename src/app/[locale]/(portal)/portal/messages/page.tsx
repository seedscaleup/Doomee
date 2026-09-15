import { getFormatter, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { listPortalComments, listPortalProjects } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

/**
 * Every conversation, in one place.
 *
 * A message belongs to a project or a deliverable — there is no free-standing
 * inbox, because a message without a subject is a message nobody can act on.
 * This screen gathers them and sends the client back to where each belongs.
 */
export default async function PortalMessagesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const projects = await listPortalProjects()

  // Sequential, not Promise.all: each call opens its own portal transaction,
  // and a burst of them would exhaust the portal pool for no benefit here.
  const threads: { projectId: string; projectName: string; count: number; last: string }[] = []
  for (const project of projects) {
    const comments = await listPortalComments({
      entityType: 'project',
      entityId: project.id,
    })
    if (comments.length === 0) continue
    const last = comments[0]
    if (last) {
      threads.push({
        projectId: project.id,
        projectName: project.name,
        count: comments.length,
        last: last.createdAt,
      })
    }
  }

  const t = await getTranslations('portal.messages')
  const format = await getFormatter()

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {threads.length === 0 ? (
        <EmptyState title={t('title')} description={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((thread) => (
            <li key={thread.projectId}>
              <Link
                href={`/portal/projects/${thread.projectId}` as '/portal'}
                className="flex min-h-touch items-center gap-2 rounded-doomee border border-border bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-label font-medium">
                  {thread.projectName}
                </span>
                <span className="text-caption text-subtle">
                  {format.dateTime(new Date(thread.last), { dateStyle: 'short' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
