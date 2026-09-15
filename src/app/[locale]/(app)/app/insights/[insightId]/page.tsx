import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listAssignableUsers } from '@/modules/actions'
import {
  getInsight,
  listInsightActions,
  listInsightResults,
  listInsightScopes,
  listResultOptions,
} from '@/modules/insights'
import { requireActor, requirePageSession } from '@/server'
import { InsightDetailScreen } from './insight-detail'

export default async function InsightPage(props: {
  params: Promise<{ locale: string; insightId: string }>
}) {
  const { locale, insightId } = await props.params
  await requirePageSession(locale)
  const actor = await requireActor()

  const insight = await getInsight({ id: insightId })
  // 404, not 403. The query already applied the collaborator scope.
  if (!insight) notFound()

  /**
   * Two permissions, asked BEFORE the fetches they gate (ADR-038). Writing an
   * insight and turning one into an action are different acts: a collaborator
   * records what they learned; a manager commits the team to doing something
   * about it.
   */
  const canManage = can(actor, 'insight.create')
  const canConvert = can(actor, 'insight.convert_to_action')

  const [linkedResults, linkedActions, scopes, results, people] = await Promise.all([
    listInsightResults({ insightId }),
    listInsightActions({ insightId }),
    canManage ? listInsightScopes() : { projects: [], clients: [] },
    canManage ? listResultOptions({}) : [],
    canConvert ? listAssignableUsers() : [],
  ])

  const t = await getTranslations('insights')

  return (
    <InsightDetailScreen
      insight={insight}
      linkedResults={linkedResults}
      linkedActions={linkedActions}
      projects={scopes.projects}
      clients={scopes.clients}
      results={results}
      people={people}
      canManage={canManage}
      canConvert={canConvert}
      backLabel={t('back')}
    />
  )
}
