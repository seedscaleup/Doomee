import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listClientOptions, listColleagueOptions, listProjects } from '@/modules/projects'
import { requireActor, requirePageSession } from '@/server'
import { ProjectsScreen } from './projects-screen'

export default async function ProjectsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  /**
   * The form's options are for whoever can fill the form.
   *
   * A collaborator reads projects but does not create them, and does not hold
   * `member.read` — so fetching the colleague list for everyone would make this
   * page fail for exactly the people the collaborator scope exists to serve.
   * Asking the same can() the gateway asks is the rule (CLAUDE.md §6); doing it
   * before the fetch rather than after the refusal is the point.
   */
  const canCreate = can(actor, 'project.create')

  const [rows, clients, colleagues] = await Promise.all([
    listProjects({}),
    canCreate ? listClientOptions() : [],
    canCreate ? listColleagueOptions() : [],
  ])
  const t = await getTranslations('projects')

  return (
    <ProjectsScreen
      rows={rows}
      clients={clients}
      colleagues={colleagues}
      canCreate={canCreate}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}
