import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  canTransition,
  checkTransition,
  type DeliverableStatusValue,
  describesSomething,
  isInFlight,
  isVisibleToClient,
  nextVersionNumber,
  statusAfterReview,
  statusTone,
} from '@/modules/deliverables/service'

const ALL: DeliverableStatusValue[] = [
  'draft',
  'production',
  'internal_review',
  'client_review',
  'changes_requested',
  'approved',
  'published',
]

describe('the deliverable state machine', () => {
  it('walks the happy path from draft to published', () => {
    expect(canTransition('draft', 'production', 'internal')).toBe(true)
    expect(canTransition('production', 'internal_review', 'internal')).toBe(true)
    expect(canTransition('internal_review', 'client_review', 'internal')).toBe(true)
    expect(canTransition('client_review', 'approved', 'client')).toBe(true)
    expect(canTransition('approved', 'published', 'internal')).toBe(true)
  })

  it('lets work go backwards for more work', () => {
    expect(canTransition('production', 'draft', 'internal')).toBe(true)
    expect(canTransition('internal_review', 'production', 'internal')).toBe(true)
    expect(canTransition('changes_requested', 'production', 'internal')).toBe(true)
  })

  /**
   * ==========================================================================
   * THE RULE THE WHOLE LOT EXISTS FOR.
   *
   * An agency that can approve its own work on the client's behalf has not
   * built a validation step, it has built a checkbox. The refusal is reported
   * as `wrong_side`, distinct from `illegal`, so the screen can say WHY
   * (ADR-041).
   * ==========================================================================
   */
  it('never lets the internal team approve on the client’s behalf', () => {
    expect(canTransition('client_review', 'approved', 'internal')).toBe(false)
    expect(checkTransition('client_review', 'approved', 'internal')).toEqual({
      ok: false,
      reason: 'wrong_side',
      allowedSide: 'client',
    })
  })

  it('never lets the internal team request changes as the client', () => {
    expect(checkTransition('client_review', 'changes_requested', 'internal')).toEqual({
      ok: false,
      reason: 'wrong_side',
      allowedSide: 'client',
    })
  })

  /** And the reverse: a client cannot drive the internal workflow either. */
  it('never lets a client move the internal workflow', () => {
    expect(canTransition('draft', 'production', 'client')).toBe(false)
    expect(canTransition('internal_review', 'client_review', 'client')).toBe(false)
    expect(canTransition('approved', 'published', 'client')).toBe(false)
  })

  it('refuses a jump the machine has no edge for', () => {
    expect(checkTransition('draft', 'published', 'internal')).toEqual({
      ok: false,
      reason: 'illegal',
    })
    expect(checkTransition('draft', 'approved', 'client')).toEqual({
      ok: false,
      reason: 'illegal',
    })
  })

  /**
   * `published` is the end. A published deliverable that needs changing gets a
   * NEW version and starts the cycle again — it does not quietly un-publish
   * itself under a client who has already seen it.
   */
  it('treats published as terminal, and says so', () => {
    expect(allowedTransitions('published', 'internal')).toEqual([])
    expect(allowedTransitions('published', 'client')).toEqual([])
    for (const to of ALL) {
      expect(checkTransition('published', to, 'internal')).toEqual({
        ok: false,
        reason: 'terminal',
      })
    }
  })

  /**
   * The exhaustive sweep. Every state, every target, both sides — so a
   * transition added to the table without being intended shows up here rather
   * than in production.
   */
  it('allows exactly eight moves in the whole machine', () => {
    const legal: string[] = []
    for (const from of ALL) {
      for (const to of ALL) {
        for (const by of ['internal', 'client'] as const) {
          if (canTransition(from, to, by)) legal.push(`${from} -${by}-> ${to}`)
        }
      }
    }

    expect(legal.sort()).toEqual(
      [
        'approved -internal-> published',
        'changes_requested -internal-> production',
        'client_review -client-> approved',
        'client_review -client-> changes_requested',
        'draft -internal-> production',
        'internal_review -internal-> client_review',
        'internal_review -internal-> production',
        'production -internal-> draft',
        'production -internal-> internal_review',
      ].sort(),
    )
  })

  it('never lets a state transition to itself', () => {
    for (const status of ALL) {
      expect(canTransition(status, status, 'internal')).toBe(false)
      expect(canTransition(status, status, 'client')).toBe(false)
    }
  })
})

describe('what a client is allowed to see', () => {
  /**
   * TWO conditions, both required. A draft flagged client-visible by mistake is
   * still not shown: the flag is consent, the status is readiness (rule 2).
   */
  it('needs the flag AND a state worth showing', () => {
    expect(isVisibleToClient({ status: 'draft', isClientVisible: true })).toBe(false)
    expect(isVisibleToClient({ status: 'production', isClientVisible: true })).toBe(false)
    expect(isVisibleToClient({ status: 'internal_review', isClientVisible: true })).toBe(false)
    expect(isVisibleToClient({ status: 'client_review', isClientVisible: true })).toBe(true)
  })

  it('shows nothing at all without the flag, whatever the state', () => {
    for (const status of ALL) {
      expect(isVisibleToClient({ status, isClientVisible: false })).toBe(false)
    }
  })

  it('keeps showing it once the client has been involved', () => {
    for (const status of ['client_review', 'changes_requested', 'approved', 'published'] as const) {
      expect(isVisibleToClient({ status, isClientVisible: true })).toBe(true)
    }
  })
})

describe('reviews and versions', () => {
  /**
   * An internal approval does not ship anything. It clears the deliverable to
   * be SENT, and sending is a separate, deliberate act — otherwise a manager's
   * "looks good" lands in the client's portal by itself.
   */
  it('does not send to the client on an internal approval', () => {
    expect(statusAfterReview('internal', 'approved')).toBe('internal_review')
    expect(statusAfterReview('internal', 'changes_requested')).toBe('production')
  })

  it('moves the deliverable on a client decision', () => {
    expect(statusAfterReview('client', 'approved')).toBe('approved')
    expect(statusAfterReview('client', 'changes_requested')).toBe('changes_requested')
  })

  it('counts versions from the rows that exist', () => {
    expect(nextVersionNumber([])).toBe(1)
    expect(nextVersionNumber([{ version: 1 }])).toBe(2)
    // Out of order, and with a gap: the answer is still one past the highest.
    expect(nextVersionNumber([{ version: 3 }, { version: 1 }])).toBe(4)
  })

  /**
   * A version with neither a file nor a link is an empty promise: the client
   * opens it, finds nothing, and reviews nothing.
   */
  it('refuses a version that is neither a file nor a link', () => {
    expect(describesSomething({})).toBe(false)
    expect(describesSomething({ fileId: null, externalUrl: null })).toBe(false)
    expect(describesSomething({ externalUrl: '   ' })).toBe(false)
    expect(describesSomething({ fileId: 'a-file' })).toBe(true)
    expect(describesSomething({ externalUrl: 'https://example.test/deck' })).toBe(true)
  })
})

describe('reading a deliverable at a glance', () => {
  it('gives every status a tone', () => {
    expect(statusTone('published')).toBe('success')
    expect(statusTone('approved')).toBe('success')
    expect(statusTone('changes_requested')).toBe('warning')
    expect(statusTone('production')).toBe('progress')
    expect(statusTone('internal_review')).toBe('progress')
    expect(statusTone('client_review')).toBe('progress')
    expect(statusTone('draft')).toBe('neutral')
  })

  it('counts everything but a published deliverable as in flight', () => {
    expect(isInFlight('published')).toBe(false)
    for (const status of ALL.filter((s) => s !== 'published')) {
      expect(isInFlight(status)).toBe(true)
    }
  })
})
