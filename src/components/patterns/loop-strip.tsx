'use client'

import { cn } from '@/lib/utils'

export type LoopStageView = {
  key: string
  label: string
  count: number
  reached: boolean
  blocked: boolean
}

/**
 * ============================================================================
 * THE LOOP, drawn.
 *
 * `OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → INSIGHT → PROCHAINE ACTION`.
 *
 * This is the product's own diagram, on the project screen, filled in with
 * that project's real counts. It answers the question CLAUDE.md §1 says to ask
 * of every feature — "does this help travel the loop?" — by showing where the
 * loop currently stops.
 *
 * The yellow marks the ONE step that is blocked, never the steps already done:
 * yellow is the colour of what to do next (rule 9), and a row of six yellow
 * dots would point at nothing.
 * ============================================================================
 */
export function LoopStrip({
  stages,
  label,
  caption,
}: {
  stages: readonly LoopStageView[]
  label: string
  caption?: string
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-section">{label}</h2>

      {/* Scrolls in its OWN container: six steps do not fit at 375px, and a
          page that scrolls sideways moves every target on it (ADR-049). */}
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {stages.map((stage) => (
          <li
            key={stage.key}
            aria-current={stage.blocked ? 'step' : undefined}
            className={cn(
              'flex min-h-touch shrink-0 flex-col justify-center gap-0.5 rounded-doomee border px-3 py-2',
              stage.blocked
                ? 'border-doomee-yellow bg-doomee-yellow text-doomee-black'
                : stage.reached
                  ? 'border-border bg-surface'
                  : 'border-border bg-surface text-subtle',
            )}
          >
            <span className="whitespace-nowrap text-caption uppercase tracking-wide">
              {stage.label}
            </span>
            <span className="text-label font-semibold tabular-nums">{stage.count}</span>
          </li>
        ))}
      </ol>

      {caption ? <p className="text-label text-muted">{caption}</p> : null}
    </section>
  )
}
