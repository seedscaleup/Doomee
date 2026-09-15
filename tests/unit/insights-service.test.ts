import { describe, expect, it } from 'vitest'
import {
  actionTitleFrom,
  canProduceAction,
  firstGap,
  isClosed,
  isSubstantiated,
  type LoopCounts,
  loopPercent,
  readLoop,
} from '@/modules/insights/service'

const counts = (overrides: Partial<LoopCounts> = {}): LoopCounts => ({
  objective: 0,
  action: 0,
  deliverable: 0,
  result: 0,
  insight: 0,
  nextAction: 0,
  ...overrides,
})

describe('reading the loop', () => {
  /**
   * The useful answer is the FIRST gap after a run of non-empty steps. A
   * project with objectives and actions but no results is stuck at RESULT;
   * telling its owner "you have no insights" is true, useless, and two steps
   * too far ahead.
   */
  it('names the first gap, not every gap', () => {
    expect(firstGap(counts({ objective: 2, action: 5 }))).toBe('deliverable')

    const stages = readLoop(counts({ objective: 2, action: 5 }))
    expect(stages.filter((stage) => stage.blocked).map((stage) => stage.step)).toEqual([
      'deliverable',
    ])
  })

  /** A project with nothing is stuck at the beginning, which is correct advice. */
  it('sends an empty project back to its objectives', () => {
    expect(firstGap(counts())).toBe('objective')
  })

  it('has no gap when every step has something', () => {
    const full = counts({
      objective: 1,
      action: 1,
      deliverable: 1,
      result: 1,
      insight: 1,
      nextAction: 1,
    })
    expect(firstGap(full)).toBeNull()
    expect(readLoop(full).every((stage) => stage.reached)).toBe(true)
  })

  /**
   * A gap in the MIDDLE does not make later steps "blocked" too. Exactly one
   * step is blocked at a time, or the screen offers six suggestions and the
   * reader follows none.
   */
  it('blocks exactly one step, even with several holes', () => {
    const holed = counts({ objective: 1, deliverable: 1, insight: 1 })
    const blocked = readLoop(holed).filter((stage) => stage.blocked)

    expect(blocked).toHaveLength(1)
    expect(blocked[0]?.step).toBe('action')
  })

  it('reports each step’s own count', () => {
    const stages = readLoop(counts({ objective: 3, action: 12 }))
    expect(stages[0]).toEqual({ step: 'objective', count: 3, reached: true, blocked: false })
    expect(stages[1]).toEqual({ step: 'action', count: 12, reached: true, blocked: false })
  })
})

describe('whether the loop is closed', () => {
  /**
   * Closed is not "all six steps are non-empty" — it is the LAST EDGE: an
   * insight produced a next action. That is the claim the product makes.
   */
  it('needs an insight AND a next action', () => {
    expect(isClosed(counts({ insight: 1, nextAction: 1 }))).toBe(true)
    expect(isClosed(counts({ insight: 1 }))).toBe(false)
    expect(isClosed(counts({ nextAction: 1 }))).toBe(false)
  })

  it('is not closed by a busy project that never concluded anything', () => {
    expect(isClosed(counts({ objective: 9, action: 40, deliverable: 12, result: 30 }))).toBe(false)
  })

  it('measures completeness in whole percents', () => {
    expect(loopPercent(counts())).toBe(0)
    expect(loopPercent(counts({ objective: 1, action: 1, deliverable: 1 }))).toBe(50)
    expect(
      loopPercent(
        counts({
          objective: 1,
          action: 1,
          deliverable: 1,
          result: 1,
          insight: 1,
          nextAction: 1,
        }),
      ),
    ).toBe(100)
    // One step of six is 16.666…: a screen showing that is a screen nobody
    // trusts.
    expect(loopPercent(counts({ objective: 1 }))).toBe(17)
  })
})

describe('what an insight says', () => {
  it('counts an insight with any filled field as substantiated', () => {
    expect(isSubstantiated({ whatWorked: 'Le carrousel' })).toBe(true)
    expect(isSubstantiated({ recommendation: 'Recommencer' })).toBe(true)
  })

  /** A title and four empty boxes is a meeting that happened, not a finding. */
  it('does not count an empty insight', () => {
    expect(isSubstantiated({})).toBe(false)
    expect(
      isSubstantiated({
        whatWorked: '   ',
        whatDidnt: null,
        whatWeLearned: '',
        recommendation: undefined,
      }),
    ).toBe(false)
  })

  /**
   * "Create next action" on an insight with no recommendation would open an
   * empty form and call it a suggestion.
   */
  it('only produces an action from a recommendation', () => {
    expect(canProduceAction({ recommendation: 'Refaire un carrousel' })).toBe(true)
    expect(canProduceAction({ recommendation: '  ' })).toBe(false)
    expect(canProduceAction({})).toBe(false)
  })
})

describe('turning a recommendation into an action title', () => {
  it('uses the recommendation as it stands', () => {
    expect(actionTitleFrom('Refaire un carrousel en mars')).toBe('Refaire un carrousel en mars')
  })

  it('collapses the whitespace a textarea leaves behind', () => {
    expect(actionTitleFrom('  Refaire   un\n  carrousel  ')).toBe('Refaire un carrousel')
  })

  /** A title cut mid-word reads as a bug, so it breaks on a space. */
  it('cuts a long recommendation on a word boundary', () => {
    const long = `${'mot '.repeat(80)}fin`
    const title = actionTitleFrom(long)

    expect(title.length).toBeLessThanOrEqual(240)
    expect(title.endsWith(' ')).toBe(false)
    expect(title).toBe(title.trim())
    expect(long.startsWith(title)).toBe(true)
  })

  /**
   * ...unless honouring the boundary would throw away most of the sentence.
   * One 300-character word truncated at character 12 loses everything.
   */
  it('cuts hard rather than losing the sentence', () => {
    const oneWord = 'a'.repeat(300)
    expect(actionTitleFrom(oneWord)).toHaveLength(240)

    const earlySpace = `mot ${'a'.repeat(300)}`
    expect(actionTitleFrom(earlySpace)).toHaveLength(240)
  })

  it('honours a caller’s own limit', () => {
    expect(actionTitleFrom('Refaire un carrousel en mars', 10)).toBe('Refaire')
  })
})
