import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { PageHeader, StatusBadge } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { statusTone } from '@/modules/deliverables/service'
import type { DeliverableStatusValue } from '@/modules/deliverables/types'
import { getPortalDeliverable, listPortalComments, listPortalReviews } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'
import { PortalThread } from '../../messages/portal-thread'
import { DecisionPanel } from './decision-panel'

export default async function PortalDeliverablePage(props: {
  params: Promise<{ locale: string; deliverableId: string }>
}) {
  const { locale, deliverableId } = await props.params
  await requirePortalPageSession(locale)

  const deliverable = await getPortalDeliverable({ id: deliverableId })
  // 404, never 403. The policies already decided; this only turns "no row"
  // into the answer a stranger would get.
  if (!deliverable) notFound()

  const [reviews, comments] = await Promise.all([
    listPortalReviews({ deliverableId }),
    listPortalComments({ entityType: 'deliverable', entityId: deliverableId }),
  ])

  const t = await getTranslations('portal.deliverables')
  const tStatus = await getTranslations('status.deliverable')
  const tMessages = await getTranslations('portal.messages')
  const format = await getFormatter()

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/portal/deliverables"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {t('back')}
      </Link>

      <PageHeader title={deliverable.title} description={deliverable.description ?? undefined} />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={tStatus(deliverable.status as DeliverableStatusValue)}
          tone={statusTone(deliverable.status as DeliverableStatusValue)}
        />
        <span className="text-label text-muted">{deliverable.projectName}</span>
        <span className="text-caption text-subtle">
          {deliverable.version === null
            ? t('noVersion')
            : t('version', { version: deliverable.version })}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {deliverable.fileUrl ? (
          // A link that expires, minted after the policies proved the row is
          // theirs (R13). Never a public object URL.
          <a
            href={deliverable.fileUrl}
            className="text-label underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            {deliverable.fileName ?? t('download')}
          </a>
        ) : null}
        {deliverable.externalUrl ? (
          <a
            href={deliverable.externalUrl}
            className="text-label underline underline-offset-4"
            rel="noreferrer noopener"
            target="_blank"
          >
            {t('open')}
          </a>
        ) : null}
      </div>

      <DecisionPanel
        deliverableId={deliverable.id}
        status={deliverable.status}
        labels={{
          decide: t('decide'),
          approve: t('approve'),
          requestChanges: t('requestChanges'),
          comment: t('comment'),
          commentRequired: t('commentRequired'),
          decided: t('decided'),
          failed: t('failed'),
        }}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t('history')}</h2>
        {reviews.length === 0 ? (
          <p className="text-label text-muted">{t('noHistory')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={review.scope === 'client' ? t('yourDecision') : t('internalReview')}
                    tone={review.decision === 'approved' ? 'success' : 'warning'}
                  />
                  <span className="text-caption text-subtle">
                    {t('version', { version: review.version })}
                  </span>
                  <span className="ml-auto text-caption text-subtle">
                    {format.dateTime(new Date(review.createdAt), { dateStyle: 'short' })}
                  </span>
                </span>
                {/* NULL for an internal review: the view blanks it (ADR-026). */}
                {review.comment ? <p className="text-label">{review.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section">{tMessages('title')}</h2>
        <PortalThread
          entityType="deliverable"
          entityId={deliverable.id}
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
