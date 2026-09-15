import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listActivity } from '@/modules/activity'
import {
  getDeliverable,
  listDeliverableTypes,
  listOwnerOptions,
  listProjectOptions,
  listReviews,
  listVersions,
} from '@/modules/deliverables'
import { requireActor, requirePageSession } from '@/server'
import { DeliverableDetailScreen } from './deliverable-detail'

export default async function DeliverablePage(props: {
  params: Promise<{ locale: string; deliverableId: string }>
}) {
  const { locale, deliverableId } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  const deliverable = await getDeliverable({ id: deliverableId })
  /**
   * 404, not 403. The query already applied the collaborator scope, so this
   * covers both "no such deliverable" and "not yours" with one answer —
   * confirming that one exists elsewhere in the organisation would itself be a
   * disclosure.
   */
  if (!deliverable) notFound()

  /**
   * Two different permissions, asked BEFORE the fetches they gate (ADR-038).
   * A collaborator creates and iterates; only a manager gives the internal
   * verdict. Neither can give the client's.
   */
  const canManage = can(actor, 'deliverable.create')
  const canReview = can(actor, 'deliverable.review_internal')

  const [versions, reviews, activity, types, owners, projects] = await Promise.all([
    listVersions({ deliverableId }),
    listReviews({ deliverableId }),
    listActivity({ entityId: deliverableId, limit: 30 }),
    canManage ? listDeliverableTypes() : [],
    canManage ? listOwnerOptions() : [],
    canManage ? listProjectOptions() : [],
  ])

  const t = await getTranslations('deliverables')

  return (
    <DeliverableDetailScreen
      deliverable={deliverable}
      versions={versions}
      reviews={reviews}
      activity={activity.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      }))}
      types={types}
      owners={owners}
      projects={projects}
      locale={locale === 'en' ? 'en' : 'fr'}
      canManage={canManage}
      canReview={canReview}
      backLabel={t('back')}
    />
  )
}
