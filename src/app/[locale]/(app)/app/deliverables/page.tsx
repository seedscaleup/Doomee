import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import {
  listDeliverables,
  listDeliverableTypes,
  listOwnerOptions,
  listProjectOptions,
} from '@/modules/deliverables'
import { requireActor, requirePageSession } from '@/server'
import { DeliverablesScreen } from './deliverables-screen'

export default async function DeliverablesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  /**
   * The form's options are for whoever can fill the form — asked BEFORE the
   * fetch, not after a refusal, so the page does not 404 for the roles the
   * collaborator scope exists to serve (ADR-038).
   */
  const canCreate = can(actor, 'deliverable.create')

  const [rows, projects, types, owners] = await Promise.all([
    listDeliverables({}),
    canCreate ? listProjectOptions() : [],
    canCreate ? listDeliverableTypes() : [],
    canCreate ? listOwnerOptions() : [],
  ])
  const t = await getTranslations('deliverables')

  return (
    <DeliverablesScreen
      rows={rows}
      projects={projects}
      types={types}
      owners={owners}
      locale={locale === 'en' ? 'en' : 'fr'}
      canCreate={canCreate}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}
