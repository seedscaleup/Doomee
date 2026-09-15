import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/patterns'
import { requirePortalPageSession } from '@/server'

/**
 * Reports arrive at LOT 12. The entry exists now because the portal's
 * navigation is part of what a client is promised, and an entry that appears
 * later looks like something that was hidden.
 */
export default async function PortalReportsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const t = await getTranslations('portal.reports')

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState title={t('empty')} description={t('comingSoon')} />
    </section>
  )
}
