import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listActions, listAssignableUsers, listProjectOptions } from '@/modules/actions'
import { requireActor, requirePageSession } from '@/server'
import { ActionsScreen } from './actions-screen'

export default async function ActionsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  // Whoever cannot create an action has no use for the options its form needs
  // — and may not be allowed to read them at all (ADR-038).
  const canCreate = can(actor, 'action.create')

  const [rows, projects, people] = await Promise.all([
    listActions({}),
    canCreate ? listProjectOptions() : [],
    canCreate ? listAssignableUsers() : [],
  ])
  const t = await getTranslations('actions')

  return (
    <ActionsScreen
      rows={rows}
      projects={projects}
      people={people}
      canCreate={canCreate}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}
