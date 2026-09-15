import { getFormatter, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/patterns'
import type { Locale } from '@/i18n/routing'
import { listPortalResults } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

/**
 * `RÉSULTAT → ANALYSE` for the client.
 *
 * The numbers, and what the team made of them. A portal that shows numbers
 * without the reading is a spreadsheet the client did not ask for.
 */
export default async function PortalResultsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const results = await listPortalResults({})
  const t = await getTranslations('portal.results')
  const format = await getFormatter()
  const readable: Locale = locale === 'en' ? 'en' : 'fr'

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {results.length === 0 ? (
        <EmptyState title={t('title')} description={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((result) => (
            <li
              key={result.id}
              className="flex flex-col gap-2 rounded-doomee border border-border bg-surface px-4 py-3"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">
                  {result.title ??
                    t('on', {
                      date: format.dateTime(new Date(result.recordedFor), {
                        dateStyle: 'short',
                      }),
                    })}
                </span>
                <span className="text-caption text-subtle">{result.projectName}</span>
              </span>

              {result.metrics.length > 0 ? (
                <dl className="grid gap-3 sm:grid-cols-3">
                  {result.metrics.map((metric) => (
                    <div key={metric.metricId} className="flex flex-col gap-0.5">
                      <dt className="text-caption uppercase tracking-wide text-subtle">
                        {metric.labels[readable] ?? ''}
                      </dt>
                      <dd className="text-label tabular-nums">
                        {/* A measurement arrives as a STRING and stays one: a
                            double would round the evidence (ADR-050). */}
                        {metric.currency
                          ? format.number(Number(metric.value), {
                              style: 'currency',
                              currency: metric.currency,
                            })
                          : format.number(Number(metric.value), {
                              maximumFractionDigits: metric.decimals,
                            })}
                        {metric.unit ? <span className="ml-1">{metric.unit}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {result.analysis ? (
                <p className="text-label">
                  <span className="text-caption uppercase tracking-wide text-subtle">
                    {t('learned')}
                  </span>
                  <br />
                  {result.analysis}
                </p>
              ) : null}
              {result.recommendation ? (
                <p className="text-label">
                  <span className="text-caption uppercase tracking-wide text-subtle">
                    {t('next')}
                  </span>
                  <br />
                  {result.recommendation}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
