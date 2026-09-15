import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import { listInsightScopes, listInsights, listResultOptions } from '@/modules/insights'
import { getResult } from '@/modules/results'
import { requireActor, requirePageSession } from '@/server'
import { InsightsScreen } from './insights-screen'

export default async function InsightsPage(props: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ fromResult?: string }>
}) {
  const { locale } = await props.params
  const search = await props.searchParams
  await requirePageSession(locale)
  const actor = await requireActor()

  // The form's options are for whoever can fill the form — asked BEFORE the
  // fetch, so the page does not 404 for a reader who may only read (ADR-038).
  const canCreate = can(actor, 'insight.create')

  const [rows, scopes, results] = await Promise.all([
    listInsights({}),
    canCreate ? listInsightScopes() : { projects: [], clients: [] },
    canCreate ? listResultOptions({}) : [],
  ])

  /**
   * `RÉSULTAT → INSIGHT`, pre-filled.
   *
   * Arriving from a result opens the form with that result attached and its
   * analysis and recommendation already in the boxes. The reading was done
   * once when the result was recorded; asking for it again is how it stops
   * being done at all (*Less typing*, rule 10).
   *
   * A bad id simply means no pre-fill — a mistyped URL should show the page,
   * not an error screen.
   */
  const source =
    canCreate && isUuid(search.fromResult)
      ? await getResult({ id: search.fromResult }).catch(() => null)
      : null

  const t = await getTranslations('insights')

  return (
    <InsightsScreen
      rows={rows}
      projects={scopes.projects}
      clients={scopes.clients}
      results={results}
      canCreate={canCreate}
      fromResult={
        source
          ? {
              id: source.id,
              projectId: source.projectId,
              title: source.title ?? source.projectName,
              analysis: source.analysis,
              recommendation: source.recommendation,
            }
          : null
      }
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}

function isUuid(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}
