import type { PerformanceRow } from './types'

/**
 * Who did best, who did worst — and when the question has no answer.
 *
 * Pure: a list of values in, a ranking out. No database, no request context, so
 * the judgement can be tested without infrastructure (CLAUDE.md §5).
 */
export type Ranking = {
  /** Best first. Empty when the metric gives no grounds to rank. */
  best: PerformanceRow[]
  /** Worst first. Empty for the same reason. */
  worst: PerformanceRow[]
  /**
   * `false` when the metric's direction is `neutral` — a headcount is neither
   * good nor bad, and calling the biggest one "best" would be an opinion the
   * data does not support (ADR-047, ADR-052).
   */
  ranked: boolean
}

const EMPTY: Ranking = { best: [], worst: [], ranked: false }

/**
 * Ranks performances according to the metric's OWN direction.
 *
 * A cost per lead of 2 beats one of 9; a revenue of 9 beats one of 2. The same
 * list, sorted two opposite ways, decided by the metric and never by the screen.
 *
 * `size` rows at each end, and never the same row twice: with four projects and
 * a size of three, "best" and "worst" would otherwise overlap and the reader
 * would see the same project praised and blamed.
 */
export function rankPerformances(rows: PerformanceRow[], direction: string, size = 3): Ranking {
  if (rows.length === 0) return EMPTY
  if (direction !== 'higher_is_better' && direction !== 'lower_is_better') {
    return { best: [], worst: [], ranked: false }
  }

  const sorted = [...rows].sort((a, b) =>
    direction === 'lower_is_better' ? a.value - b.value : b.value - a.value,
  )

  // One row cannot be both the best and the worst, and two rows cannot be the
  // whole podium twice over. Below four rows the ends would overlap, so the
  // list is shown as-is rather than cut into two halves that repeat each other.
  if (sorted.length < 2) return { best: sorted, worst: [], ranked: true }

  const take = Math.min(size, Math.floor(sorted.length / 2))

  return {
    best: sorted.slice(0, take),
    worst: sorted.slice(sorted.length - take).reverse(),
    ranked: true,
  }
}
