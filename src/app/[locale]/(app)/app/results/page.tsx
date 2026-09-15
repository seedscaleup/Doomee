import { getTranslations } from 'next-intl/server'
import { can } from '@/lib/permissions'
import {
  listResultFilterOptions,
  listResults,
  metricBreakdown,
  metricTotals,
} from '@/modules/results'
import { requireActor, requirePageSession } from '@/server'
import { type Filters, ResultsScreen } from './results-screen'

type Search = Partial<Record<keyof Filters, string>>

export default async function ResultsPage(props: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Search>
}) {
  const { locale } = await props.params
  const search = await props.searchParams
  await requirePageSession(locale)
  const actor = await requireActor()

  /**
   * Thirty days ending today, unless asked otherwise. A window that defaults to
   * "everything" is a window nobody can compare against anything.
   */
  const to = isDay(search.to) ? search.to : new Date().toISOString().slice(0, 10)
  const from = isDay(search.from) ? search.from : shiftDays(to, -29)

  const filters: Filters = {
    from,
    to,
    projectId: uuidOr(search.projectId),
    clientId: uuidOr(search.clientId),
    channelId: uuidOr(search.channelId),
    actionTypeId: uuidOr(search.actionTypeId),
    recordedById: uuidOr(search.recordedById),
    metricId: uuidOr(search.metricId),
  }

  /**
   * The same narrowing reaches the rows, the totals and the breakdown, so the
   * three panels can never disagree about which window they are describing.
   * `undefined`, not `''`: the schema takes an optional uuid, and an empty
   * string is not one.
   */
  const scope = {
    from,
    to,
    projectId: blankToUndefined(filters.projectId),
    clientId: blankToUndefined(filters.clientId),
    channelId: blankToUndefined(filters.channelId),
    actionTypeId: blankToUndefined(filters.actionTypeId),
    recordedById: blankToUndefined(filters.recordedById),
  }

  const [rows, totals, options] = await Promise.all([
    listResults(scope),
    metricTotals(scope),
    listResultFilterOptions(),
  ])

  // Only when a metric is chosen: the breakdown costs a query, and a podium
  // nobody asked for is a query nobody needed.
  const breakdown =
    filters.metricId === '' ? [] : await metricBreakdown({ ...scope, metricId: filters.metricId })

  const t = await getTranslations('results')

  return (
    <ResultsScreen
      rows={rows}
      totals={totals}
      breakdown={breakdown}
      filters={filters}
      options={options}
      locale={locale === 'en' ? 'en' : 'fr'}
      canCreateInsight={can(actor, 'insight.create')}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}

function isDay(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * A query string is whatever the address bar contains. Anything that is not a
 * uuid becomes "no filter" here rather than a validation error three layers
 * down — a mistyped URL should show the unfiltered page, not an error screen.
 */
function uuidOr(value: string | undefined): string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : ''
}

function blankToUndefined(value: string): string | undefined {
  return value === '' ? undefined : value
}

function shiftDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
