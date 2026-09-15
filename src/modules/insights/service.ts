/**
 * ============================================================================
 * THE LOOP, as something the product can reason about.
 *
 * Pure: counts in, a reading out. No database, no request context — so "where
 * does this project stand in the loop?" can be tested without infrastructure
 * (CLAUDE.md §5).
 * ============================================================================
 */

/** The eight steps, in the order CLAUDE.md §1 states them. */
export const LOOP_STEPS = [
  'objective',
  'action',
  'deliverable',
  'result',
  'insight',
  'nextAction',
] as const

export type LoopStep = (typeof LOOP_STEPS)[number]

export type LoopCounts = Record<LoopStep, number>

export type LoopStage = {
  step: LoopStep
  count: number
  /** `true` once something exists at this step. */
  reached: boolean
  /**
   * The FIRST step with nothing in it, when everything before it has
   * something. That is where the loop is actually stuck — and the only place
   * a suggestion is worth making.
   */
  blocked: boolean
}

/**
 * Where the loop stands, and where it stops.
 *
 * The interesting answer is not "how many of each" — it is the first gap after
 * a run of non-empty steps. A project with objectives and actions but no
 * results is stuck at RESULT; telling its owner "you have no insights" would
 * be true, useless, and two steps too far ahead.
 *
 * A project with nothing at all is stuck at the first step, which is the
 * correct and useful answer: start by saying what you are trying to achieve.
 */
export function readLoop(counts: LoopCounts): LoopStage[] {
  let blockedFound = false

  return LOOP_STEPS.map((step) => {
    const count = counts[step] ?? 0
    const reached = count > 0
    const blocked = !reached && !blockedFound

    if (blocked) blockedFound = true

    return { step, count, reached, blocked }
  })
}

/** The first step with nothing in it, or `null` when the loop is complete. */
export function firstGap(counts: LoopCounts): LoopStep | null {
  return readLoop(counts).find((stage) => stage.blocked)?.step ?? null
}

/**
 * Is the loop CLOSED?
 *
 * Not "are all six steps non-empty" — closed means the last edge exists: an
 * insight produced a next action. That is the claim Doomee makes, and it is
 * either true for a project or it is not.
 */
export function isClosed(counts: LoopCounts): boolean {
  return counts.insight > 0 && counts.nextAction > 0
}

/**
 * How complete the loop is, as a percentage of steps reached.
 *
 * Rounded to an integer because a loop is not measured to one decimal place,
 * and a screen that shows 16.666% is a screen nobody trusts.
 */
export function loopPercent(counts: LoopCounts): number {
  const reached = LOOP_STEPS.filter((step) => (counts[step] ?? 0) > 0).length
  return Math.round((reached / LOOP_STEPS.length) * 100)
}

/**
 * The four fields of an insight, and whether it says anything.
 *
 * An insight with a title and four empty boxes is a meeting that happened, not
 * a finding. The product does not refuse it — an insight can be filled in over
 * two sittings — but a list can say which ones are still empty.
 */
export function isSubstantiated(insight: {
  whatWorked?: string | null
  whatDidnt?: string | null
  whatWeLearned?: string | null
  recommendation?: string | null
}): boolean {
  return [
    insight.whatWorked,
    insight.whatDidnt,
    insight.whatWeLearned,
    insight.recommendation,
  ].some((field) => Boolean(field?.trim()))
}

/**
 * Can this insight produce a next action?
 *
 * Only if it recommends something. "Create next action" on an insight with no
 * recommendation would open an empty form and call it a suggestion.
 */
export function canProduceAction(insight: { recommendation?: string | null }): boolean {
  return Boolean(insight.recommendation?.trim())
}

/**
 * The title a next action starts with.
 *
 * The recommendation IS the action, most of the time — so it is pre-filled
 * rather than asked for again (*Less typing*, rule 10). Trimmed to what an
 * action title can hold, on a word boundary where there is one: a title cut
 * mid-word reads as a bug.
 */
export function actionTitleFrom(recommendation: string, maxLength = 240): string {
  const text = recommendation.trim().replace(/\s+/g, ' ')
  if (text.length <= maxLength) return text

  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  // Only honour a word boundary that is not absurdly early: a 240-character
  // limit broken at character 12 would lose the sentence.
  return lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut
}
