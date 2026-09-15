import { describe, expect, it } from 'vitest'
import { rankPerformances } from '@/modules/results/service'
import type { PerformanceRow } from '@/modules/results/types'

const row = (name: string, value: number): PerformanceRow => ({
  projectId: name,
  projectName: name,
  clientName: null,
  value,
  samples: 1,
})

describe('ranking performances', () => {
  const rows = [row('a', 10), row('b', 2), row('c', 7), row('d', 4), row('e', 9), row('f', 1)]

  it('puts the largest first when higher is better', () => {
    const { best, worst, ranked } = rankPerformances(rows, 'higher_is_better')

    expect(ranked).toBe(true)
    expect(best.map((r) => r.projectName)).toEqual(['a', 'e', 'c'])
    // Worst-first, so the reader meets the biggest problem before the smaller one.
    expect(worst.map((r) => r.projectName)).toEqual(['f', 'b', 'd'])
  })

  /**
   * The same six numbers, read the other way round. A cost per lead of 1 is the
   * BEST result on the page, and a ranking that ignored direction would call it
   * the worst (ADR-047).
   */
  it('reverses entirely when lower is better', () => {
    const { best, worst } = rankPerformances(rows, 'lower_is_better')

    expect(best.map((r) => r.projectName)).toEqual(['f', 'b', 'd'])
    expect(worst.map((r) => r.projectName)).toEqual(['a', 'e', 'c'])
  })

  /**
   * A neutral metric — a headcount, a number of posts — has no better end.
   * Calling one project "best" would be an opinion the data cannot support, so
   * the product abstains rather than inventing a verdict (ADR-052).
   */
  it('refuses to rank a metric with no direction', () => {
    const ranking = rankPerformances(rows, 'neutral')

    expect(ranking.ranked).toBe(false)
    expect(ranking.best).toEqual([])
    expect(ranking.worst).toEqual([])
  })

  /**
   * The guard that matters visually: with four projects and a podium of three,
   * naive slicing would show project "b" as both a top performer and a bottom
   * one on the same screen.
   */
  it('never puts the same project in both ends', () => {
    const four = [row('a', 4), row('b', 3), row('c', 2), row('d', 1)]
    const { best, worst } = rankPerformances(four, 'higher_is_better')

    const overlap = best.filter((b) => worst.some((w) => w.projectId === b.projectId))
    expect(overlap).toEqual([])
    expect(best.map((r) => r.projectName)).toEqual(['a', 'b'])
    expect(worst.map((r) => r.projectName)).toEqual(['d', 'c'])
  })

  it('shows a lone project without pretending it is also the worst', () => {
    const { best, worst, ranked } = rankPerformances([row('a', 4)], 'higher_is_better')

    expect(ranked).toBe(true)
    expect(best.map((r) => r.projectName)).toEqual(['a'])
    expect(worst).toEqual([])
  })

  it('has nothing to say about nothing', () => {
    expect(rankPerformances([], 'higher_is_better')).toEqual({
      best: [],
      worst: [],
      ranked: false,
    })
  })

  /** Sorting must not reorder the caller's array under its feet. */
  it('leaves the input alone', () => {
    const input = [row('a', 1), row('b', 9)]
    rankPerformances(input, 'higher_is_better')
    expect(input.map((r) => r.projectName)).toEqual(['a', 'b'])
  })
})
