import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listActivity } from '@/modules/activity'
import {
  getProject,
  listClientOptions,
  listColleagueOptions,
  listMilestones,
  listProjectMembers,
} from '@/modules/projects'
import { requireActor, requirePageSession } from '@/server'
import { ProjectDetailScreen } from './project-detail'

export default async function ProjectPage(props: {
  params: Promise<{ locale: string; projectId: string }>
}) {
  const { locale, projectId } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  const project = await getProject({ id: projectId })
  /**
   * 404, not 403. The query already applied the collaborator scope, so this
   * covers both "no such project" and "not yours" with the same answer —
   * confirming that a project exists elsewhere in the organisation would be a
   * disclosure in itself.
   */
  if (!project) notFound()

  /**
   * Editing the project, its team and its milestones is one permission. A
   * collaborator on the project reads all of it and changes none of it — and
   * does not hold `member.read`, so the colleague list is not even fetched for
   * them (CLAUDE.md §6: the interface asks the same can() the gateway asks).
   */
  const canManage = can(actor, 'project.update')

  const [members, milestones, clients, colleagues, activity] = await Promise.all([
    listProjectMembers({ projectId }),
    listMilestones({ projectId }),
    canManage ? listClientOptions() : [],
    canManage ? listColleagueOptions() : [],
    listActivity({ projectId, limit: 30 }),
  ])

  const t = await getTranslations('projects')

  return (
    <ProjectDetailScreen
      project={project}
      members={members}
      milestones={milestones}
      clients={clients}
      colleagues={colleagues}
      canManage={canManage}
      activity={activity.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      }))}
      backLabel={t('title')}
    />
  )
}
