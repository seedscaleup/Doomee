'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './status-badge'

export type HealthFactorView = {
  code: string
  weight: number
  score: number
  params: Record<string, number>
}

/**
 * ============================================================================
 * 🔒 THE HEALTH SCORE — INTERNAL SCREENS ONLY.
 *
 * ADR-025: the commanditaire decided on 2026-09-14 that a client never sees
 * this. It is not a threshold or a preference, it is a product decision — so
 * this component must never be imported from `src/app/[locale]/(portal)`, and
 * `project_health_snapshots` has no `portal.*` view at all.
 *
 * The score is shown WITH its reasons, never alone. A number without reasons
 * is a number nobody can act on, and a health score nobody acts on is a
 * decoration.
 * ============================================================================
 */
export function HealthScore({
  score,
  status,
  factors,
  computedAt,
}: {
  score: number | null
  status: 'healthy' | 'at_risk' | 'blocked' | null
  /** Already narrowed to what is costing points — see `worstFactors`. */
  factors: readonly HealthFactorView[]
  computedAt: string | null
}) {
  const t = useTranslations('health')
  // Statuses are enums whose labels live in the catalogues (ADR-010).
  const tStatus = useTranslations('status.health')
  const [open, setOpen] = useState(false)

  if (score === null || status === null) {
    return <p className="text-label text-muted">{t('never')}</p>
  }

  const tone = status === 'healthy' ? 'success' : status === 'at_risk' ? 'warning' : 'danger'

  return (
    <section className="flex flex-col gap-3 rounded-doomee border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-label font-semibold">{t('title')}</h2>
        {/* The score is a badge, not coloured text: a brand colour carrying
            text has to clear 4.5:1, and these do not (ADR-032). */}
        <StatusBadge label={t('score', { score })} tone={tone} />
        <StatusBadge label={tStatus(status)} tone={tone} />
        {computedAt ? (
          <span className="ml-auto text-caption text-subtle">
            {t('computedAt', { date: computedAt })}
          </span>
        ) : null}
      </div>

      {/* Said out loud, on the screen itself. A developer reading this page
          should not have to find ADR-025 to know the rule. */}
      <p className="text-caption text-subtle">{t('internalOnly')}</p>

      {factors.length === 0 ? (
        <p className="text-label text-muted">{t('allGood')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-h-touch w-fit items-center text-label underline underline-offset-4"
          >
            {t('factors')}
          </button>

          {open ? (
            <ul className="flex flex-col gap-2">
              {factors.map((factor) => (
                <FactorLine key={factor.code} factor={factor} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * One factor, in the reader's language.
 *
 * Rendered from `code` + `params` by the i18n catalogue (ADR-011): the same
 * stored row reads in French for one colleague and in English for another,
 * with no recomputation.
 */
function FactorLine({ factor }: { factor: HealthFactorView }) {
  const t = useTranslations('health')

  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-label font-medium">{t(`factorName.${factor.code}`)}</span>
        <span className="text-caption text-subtle">
          {t('weight', { percent: Math.round(factor.weight * 100) })}
        </span>
        <span
          className={cn(
            'ml-auto text-label tabular-nums',
            factor.score < 50 ? 'font-semibold' : 'text-muted',
          )}
        >
          {factor.score}
        </span>
      </span>
      <span className="text-caption text-muted">{t(`factor.${factor.code}`, factor.params)}</span>
    </li>
  )
}
