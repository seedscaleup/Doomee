import { notFound } from 'next/navigation'
import { can } from '@/lib/permissions'
import {
  getAction,
  listActionCollaborators,
  listActionTaxonomies,
  listAssignableUsers,
  listAttachments,
  listComments,
} from '@/modules/actions'
import { listActivity } from '@/modules/activity'
import { requireActor, requirePageSession } from '@/server'
import { ActionDetailScreen } from './action-detail'

export default async function ActionPage(props: {
  params: Promise<{ locale: string; actionId: string }>
}) {
  const { locale, actionId } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  const action = await getAction({ id: actionId })
  // 404, not 403: the query already applied the project scope, so this covers
  // "no such action" and "not yours" with the same answer (ADR-038).
  if (!action) notFound()

  const canEdit = can(actor, 'action.update_own')

  const [collaborators, comments, attachments, taxonomies, people, activity] = await Promise.all([
    listActionCollaborators({ actionId }),
    listComments({ actionId }),
    listAttachments({ actionId }),
    listActionTaxonomies(),
    canEdit ? listAssignableUsers() : [],
    listActivity({ limit: 30 }),
  ])

  return (
    <ActionDetailScreen
      action={action}
      collaborators={collaborators}
      comments={comments}
      attachments={attachments}
      taxonomies={taxonomies}
      people={people}
      locale={locale === 'en' ? 'en' : 'fr'}
      canEdit={canEdit}
      activity={activity
        .filter((entry) => entry.entityId === actionId)
        .map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
    />
  )
}
