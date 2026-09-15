'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { EmptyState, PageHeader, StatusBadge } from '@/components/patterns'
import { Button, Field, Select, TextInput } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { type Ranking, rankPerformances } from '@/modules/results/service'
import type { FilterOptions, MetricTotal, PerformanceRow, ResultRow } from '@/modules/results/types'

/** Everything the window can be narrowed by. Empty string means "all". */
export type Filters = {
  from: string
  to: string
  projectId: string
  clientId: string
  channelId: string
  actionTypeId: string
  recordedById: string
  metricId: string
}

/**
 * The consolidated view: every metric over a window, next to the same window
 * before it, and then the projects behind the numbers.
 *
 * The comparison is the point. A number on its own is trivia; the same number
 * against the previous period, broken down by project, is the beginning of
 * "what should we do next?".
 */
export function ResultsScreen({
  rows,
  totals,
  breakdown,
  filters,
  options,
  locale,
  canCreateInsight,
  labels,
}: {
  rows: ResultRow[]
  totals: MetricTotal[]
  /** The chosen metric, project by project. Empty when no metric is chosen. */
  breakdown: PerformanceRow[]
  filters: Filters
  options: FilterOptions
  locale: Locale
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canCreateInsight: boolean
  labels: { title: string; description: string }
}) {
  const t = useTranslations('results')
  const tInsights = useTranslations('insights')
  const format = useFormatter()
  const router = useRouter()

  const chosen = totals.find((metric) => metric.metricId === filters.metricId) ?? null
  const ranking = chosen ? rankPerformances(breakdown, chosen.direction) : null

  function apply(patch: Partial<Filters>) {
    const next = { ...filters, ...patch }
    const query = Object.entries(next)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')
    router.push(`/app/results?${query}` as '/app')
  }

  const anyFilter =
    filters.projectId !== '' ||
    filters.clientId !== '' ||
    filters.channelId !== '' ||
    filters.actionTypeId !== '' ||
    filters.recordedById !== ''

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={labels.title} description={labels.description} />

      {/* Wrapping, not scrolling: seven controls on a phone become seven rows,
          and the page itself never moves sideways (ADR-049). */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('filters.from')}>
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              defaultValue={filters.from}
              onChange={(event) => {
                if (isDay(event.target.value)) apply({ from: event.target.value })
              }}
            />
          )}
        </Field>
        <Field label={t('filters.to')}>
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              defaultValue={filters.to}
              onChange={(event) => {
                if (isDay(event.target.value)) apply({ to: event.target.value })
              }}
            />
          )}
        </Field>

        <Picker
          label={t('filters.client')}
          value={filters.clientId}
          all={t('filters.all')}
          options={options.clients.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(clientId) => apply({ clientId })}
        />
        <Picker
          label={t('filters.project')}
          value={filters.projectId}
          all={t('filters.all')}
          options={options.projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(projectId) => apply({ projectId })}
        />
        <Picker
          label={t('filters.channel')}
          value={filters.channelId}
          all={t('filters.all')}
          options={options.channels.map((c) => ({
            value: c.id,
            label: c.labels[locale] ?? c.id,
          }))}
          onChange={(channelId) => apply({ channelId })}
        />
        <Picker
          label={t('filters.actionType')}
          value={filters.actionTypeId}
          all={t('filters.all')}
          options={options.actionTypes.map((a) => ({
            value: a.id,
            label: a.labels[locale] ?? a.id,
          }))}
          onChange={(actionTypeId) => apply({ actionTypeId })}
        />
        <Picker
          label={t('filters.recordedBy')}
          value={filters.recordedById}
          all={t('filters.all')}
          options={options.people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(recordedById) => apply({ recordedById })}
        />

        {anyFilter ? (
          <Button
            variant="ghost"
            onClick={() =>
              apply({
                projectId: '',
                clientId: '',
                channelId: '',
                actionTypeId: '',
                recordedById: '',
              })
            }
          >
            {t('filters.reset')}
          </Button>
        ) : null}
      </div>

      {totals.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-section">{t('totals.title')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {totals.map((metric) => (
              <MetricTile key={metric.metricId} metric={metric} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}

      {totals.length > 0 ? (
        <PerformancePanel
          totals={totals}
          chosen={chosen}
          ranking={ranking}
          locale={locale}
          onChoose={(metricId) => apply({ metricId })}
        />
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={t('noResultsTitle')} description={t('noResultsDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((result) => (
            <li
              key={result.id}
              className="flex flex-col gap-2 rounded-doomee border border-border bg-surface px-3 py-2"
            >
              <Link
                href={`/app/projects/${result.projectId}` as '/app'}
                className="flex min-h-touch flex-col gap-1"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {result.title ??
                      t('untitled', {
                        date: format.dateTime(new Date(result.recordedFor), {
                          dateStyle: 'short',
                        }),
                      })}
                  </span>
                  <span className="text-caption text-muted">{result.projectName}</span>
                  {result.clientName ? (
                    <span className="text-caption text-subtle">{result.clientName}</span>
                  ) : null}
                </span>
                {result.analysis ? (
                  <span className="text-label text-muted">{result.analysis}</span>
                ) : null}
              </Link>

              {/* `RÉSULTAT → ANALYSE → INSIGHT`, as one link. The insight form
                  arrives pre-filled from the analysis and the recommendation
                  this result already carries — the reading was done once, and
                  retyping it is how it stops being done at all. */}
              {canCreateInsight ? (
                <Link
                  href={`/app/insights?fromResult=${result.id}` as '/app'}
                  className="w-fit text-label underline underline-offset-4"
                >
                  {tInsights('fromResult')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Best and weakest, side by side.
 *
 * One metric at a time, deliberately: six podiums on one screen is six things
 * to read and nothing to decide (*One thing at a time*).
 */
function PerformancePanel({
  totals,
  chosen,
  ranking,
  locale,
  onChoose,
}: {
  totals: MetricTotal[]
  chosen: MetricTotal | null
  ranking: Ranking | null
  locale: Locale
  onChoose: (metricId: string) => void
}) {
  const t = useTranslations('results.performance')

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-section">{t('title')}</h2>
        <Picker
          label={t('metric')}
          value={chosen?.metricId ?? ''}
          all={t('metric')}
          options={totals.map((metric) => ({
            value: metric.metricId,
            label: metric.labels[locale] ?? metric.code,
          }))}
          onChange={onChoose}
        />
      </div>

      {chosen === null || ranking === null ? null : !ranking.ranked ? (
        // A neutral metric has no better end. Saying so is more useful than a
        // podium the data cannot justify (ADR-052).
        <p className="text-label text-muted">{t('unranked')}</p>
      ) : ranking.best.length === 0 ? (
        <p className="text-label text-muted">{t('none')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Podium title={t('best')} rows={ranking.best} metric={chosen} tone="success" />
          {ranking.worst.length > 0 ? (
            <Podium title={t('worst')} rows={ranking.worst} metric={chosen} tone="warning" />
          ) : null}
        </div>
      )}
    </section>
  )
}

function Podium({
  title,
  rows,
  metric,
  tone,
}: {
  title: string
  rows: PerformanceRow[]
  metric: MetricTotal
  tone: 'success' | 'warning'
}) {
  const t = useTranslations('results.performance')
  const format = useFormatter()

  return (
    <div className="flex flex-col gap-2 rounded-doomee border border-border bg-surface px-4 py-3">
      {/* The tone is a border and a badge, never coloured text (ADR-032). */}
      <h3 className="flex items-center gap-2 text-label font-semibold">
        <StatusBadge label={title} tone={tone} />
      </h3>
      <ol className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.projectId} className="flex flex-wrap items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-label">{row.projectName}</span>
            <span className="text-label font-semibold tabular-nums">
              {format.number(row.value, { maximumFractionDigits: metric.decimals })}
              {metric.unit ? <span className="ml-1 font-normal">{metric.unit}</span> : null}
            </span>
            <span className="text-caption text-subtle">{t('samples', { count: row.samples })}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Picker({
  label,
  value,
  all,
  options,
  onChange,
}: {
  label: string
  value: string
  all: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{all}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}

/**
 * The change against the previous window, and whether it is good news.
 *
 * `better` follows the metric's DIRECTION: a cost going down is good, and a
 * green arrow on a rising cost per lead is a lie told in colour (ADR-047).
 */
function compare(metric: MetricTotal): { change: number | null; better: boolean | null } {
  if (metric.previous === null || metric.previous === 0) return { change: null, better: null }

  const change = Math.round(((metric.total - metric.previous) / Math.abs(metric.previous)) * 100)
  if (metric.direction === 'neutral') return { change, better: null }

  return { change, better: metric.direction === 'lower_is_better' ? change < 0 : change > 0 }
}

/** One metric, its total and the change against the previous window. */
function MetricTile({ metric, locale }: { metric: MetricTotal; locale: Locale }) {
  const t = useTranslations('results.totals')
  const format = useFormatter()

  const { change, better } = compare(metric)

  return (
    <li className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-4 py-3">
      <span className="text-caption uppercase tracking-wide text-subtle">
        {metric.labels[locale] ?? metric.code}
      </span>
      <span className="text-2xl font-semibold tabular-nums">
        {format.number(metric.total, { maximumFractionDigits: metric.decimals })}
        {metric.unit ? <span className="ml-1 text-label font-normal">{metric.unit}</span> : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {change === null ? (
          <span className="text-caption text-subtle">{t('noPrevious')}</span>
        ) : (
          <StatusBadge
            label={t('change', { percent: change > 0 ? `+${change}` : String(change) })}
            tone={better === null ? 'neutral' : better ? 'success' : 'warning'}
          />
        )}
        <span className="text-caption text-subtle">{t('samples', { count: metric.samples })}</span>
      </span>
    </li>
  )
}

function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
