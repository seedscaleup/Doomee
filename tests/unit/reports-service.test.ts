import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  calendarDay,
  canTransition,
  checkShare,
  DEFAULT_SHARE_DAYS,
  defaultClientVisibility,
  defaultSectionsFor,
  includedSections,
  isEditable,
  isInternalSection,
  isShareable,
  MAX_SHARE_DAYS,
  type ReportStatusValue,
  type ReportType,
  SECTION_KEYS,
  type SectionKey,
  scheduledPeriod,
  sharedSections,
  shareExpiryFrom,
  statusTone,
} from '@/modules/reports/service'

const TYPES: ReportType[] = [
  'weekly_internal',
  'monthly',
  'project',
  'client',
  'campaign_review',
  'period_review',
]
const STATUSES: ReportStatusValue[] = ['draft', 'in_review', 'published', 'archived']

describe('the default sections of a report', () => {
  it.each(TYPES)('gives %s a non-empty, ordered, duplicate-free list', (type) => {
    const sections = defaultSectionsFor(type)

    expect(sections.length).toBeGreaterThan(0)
    expect(new Set(sections).size).toBe(sections.length)
    for (const key of sections) expect(SECTION_KEYS).toContain(key)
  })

  /**
   * A weekly internal note and a monthly client report are not the same
   * document and should not open with the same eleven empty boxes.
   */
  it('does not open a weekly internal note with an executive summary', () => {
    expect(defaultSectionsFor('weekly_internal')).not.toContain('executive_summary')
    expect(defaultSectionsFor('monthly')).toContain('executive_summary')
  })

  it('gives a client report the comparison to its objectives', () => {
    expect(defaultSectionsFor('client')).toContain('objectives_comparison')
  })
})

describe('what a client never sees in a report', () => {
  /**
   * `attention_points` is the team's own list of what is going wrong — the
   * report's equivalent of `what_didnt` on an insight (ADR-065).
   */
  it('keeps the attention points internal', () => {
    expect(isInternalSection('attention_points')).toBe(true)
    expect(defaultClientVisibility('attention_points')).toBe(false)
  })

  it('starts every other section visible', () => {
    for (const key of SECTION_KEYS.filter((k) => k !== 'attention_points')) {
      expect(defaultClientVisibility(key), key).toBe(true)
    }
  })

  /** Ticked on by hand or not, an internal section is dropped from a share. */
  it('drops an internal section even when it was marked visible', () => {
    const sections = [
      { key: 'results' as SectionKey, isIncluded: true, isClientVisible: true },
      { key: 'attention_points' as SectionKey, isIncluded: true, isClientVisible: true },
    ]
    expect(sharedSections(sections).map((s) => s.key)).toEqual(['results'])
  })

  it('drops a section that is hidden or excluded', () => {
    const sections = [
      { key: 'results' as SectionKey, isIncluded: true, isClientVisible: true },
      { key: 'analysis' as SectionKey, isIncluded: true, isClientVisible: false },
      { key: 'insights' as SectionKey, isIncluded: false, isClientVisible: true },
    ]
    expect(sharedSections(sections).map((s) => s.key)).toEqual(['results'])
  })

  it('orders the internal reading by sort order', () => {
    const sections = [
      { key: 'results', isIncluded: true, sortOrder: 2 },
      { key: 'objectives', isIncluded: true, sortOrder: 1 },
      { key: 'insights', isIncluded: false, sortOrder: 0 },
    ]
    expect(includedSections(sections).map((s) => s.key)).toEqual(['objectives', 'results'])
  })
})

describe('the life of a report', () => {
  it('goes from draft to published, directly or through review', () => {
    expect(canTransition('draft', 'published')).toBe(true)
    expect(canTransition('draft', 'in_review')).toBe(true)
    expect(canTransition('in_review', 'published')).toBe(true)
    expect(canTransition('in_review', 'draft')).toBe(true)
  })

  /**
   * ADR-014. Not a style rule: the PDF in the client's inbox and the page on
   * their screen must say the same thing, and the only way to guarantee that
   * is to make the source unchangeable.
   */
  it('never lets a published report go back to draft', () => {
    expect(canTransition('published', 'draft')).toBe(false)
    expect(canTransition('published', 'in_review')).toBe(false)
    expect(allowedTransitions('published')).toEqual(['archived'])
  })

  it('treats archived as the end', () => {
    expect(allowedTransitions('archived')).toEqual([])
    for (const to of STATUSES) expect(canTransition('archived', to)).toBe(false)
  })

  it('never lets a status transition to itself', () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(false)
  })

  it('allows editing only before publication', () => {
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('in_review')).toBe(true)
    expect(isEditable('published')).toBe(false)
    expect(isEditable('archived')).toBe(false)
  })

  /** Sharing a draft would share a document that is still changing. */
  it('allows sharing only once published', () => {
    expect(isShareable('published')).toBe(true)
    expect(isShareable('draft')).toBe(false)
    expect(isShareable('in_review')).toBe(false)
    expect(isShareable('archived')).toBe(false)
  })

  it('gives every status a tone', () => {
    for (const status of STATUSES) expect(statusTone(status)).toBeTruthy()
    expect(statusTone('published')).toBe('success')
  })
})

describe('a share link', () => {
  const now = new Date('2026-03-10T12:00:00Z')
  const live = {
    revokedAt: null,
    expiresAt: new Date('2026-03-17T12:00:00Z'),
    passwordHash: null,
  }

  it('opens when it is live and carries no password', () => {
    expect(checkShare(live, { now, passwordMatches: null })).toEqual({ ok: true })
  })

  /**
   * Revocation is checked BEFORE expiry: a link that was revoked was revoked,
   * and saying "expired" would understate what happened.
   */
  it('says revoked rather than expired when it is both', () => {
    const both = {
      revokedAt: new Date('2026-03-01T00:00:00Z'),
      expiresAt: new Date('2026-03-02T00:00:00Z'),
      passwordHash: null,
    }
    expect(checkShare(both, { now, passwordMatches: null })).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('refuses an expired link, and says so', () => {
    const expired = { ...live, expiresAt: new Date('2026-03-09T12:00:00Z') }
    expect(checkShare(expired, { now, passwordMatches: null })).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  /** Expiry is inclusive of the instant: at the very second, it is over. */
  it('refuses a link at the exact moment it expires', () => {
    const exact = { ...live, expiresAt: now }
    expect(checkShare(exact, { now, passwordMatches: null })).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('asks for a password before judging one', () => {
    const locked = { ...live, passwordHash: 'a-hash' }
    expect(checkShare(locked, { now, passwordMatches: null })).toEqual({
      ok: false,
      reason: 'password_required',
    })
    expect(checkShare(locked, { now, passwordMatches: false })).toEqual({
      ok: false,
      reason: 'password_wrong',
    })
    expect(checkShare(locked, { now, passwordMatches: true })).toEqual({ ok: true })
  })

  /** A link that never expires is a permanent grant handed to whoever forwards the mail. */
  it('always has an expiry, and never an unbounded one', () => {
    expect(shareExpiryFrom(now).getTime()).toBe(now.getTime() + DEFAULT_SHARE_DAYS * 86_400_000)
    expect(shareExpiryFrom(now, 9999).getTime()).toBe(now.getTime() + MAX_SHARE_DAYS * 86_400_000)
    expect(shareExpiryFrom(now, 0).getTime()).toBe(now.getTime() + 86_400_000)
    expect(shareExpiryFrom(now, -30).getTime()).toBeGreaterThan(now.getTime())
  })
})

/**
 * ============================================================================
 * The scheduled windows — "every Friday" and "end of month".
 *
 * A job that computed its own window would be testable only by waiting for a
 * Friday. These are the cases that decide whether a week of work lands in the
 * right report.
 * ============================================================================
 */
describe('scheduledPeriod — weekly', () => {
  it('covers the Monday-to-Sunday week the run falls in', () => {
    // Friday 2026-09-18, the day the job is meant to fire.
    const period = scheduledPeriod('weekly', new Date('2026-09-18T17:00:00Z'), 'UTC')

    expect(period.periodStart).toBe('2026-09-14')
    expect(period.periodEnd).toBe('2026-09-20')
    expect(period.anchor).toBe('2026-09-14')
  })

  it('is an INTERNAL point, never a client document', () => {
    expect(scheduledPeriod('weekly', new Date('2026-09-18T17:00:00Z'), 'UTC').type).toBe(
      'weekly_internal',
    )
  })

  it('treats Sunday as the end of its own week, not the start of the next', () => {
    const period = scheduledPeriod('weekly', new Date('2026-09-20T10:00:00Z'), 'UTC')
    expect(period.periodStart).toBe('2026-09-14')
    expect(period.periodEnd).toBe('2026-09-20')
  })

  /**
   * R9, the reason every date in this product carries a time zone: at 23:30 UTC
   * on a Friday it is already Saturday in Abidjan's neighbours to the east and
   * still Friday in Paris. Reading the day in the wrong zone silently moves a
   * report by a week.
   */
  it('reads the day in the ORGANISATION’s zone', () => {
    const instant = new Date('2026-09-20T23:30:00Z') // Sunday late, UTC

    expect(scheduledPeriod('weekly', instant, 'UTC').periodStart).toBe('2026-09-14')
    // Already Monday in Tokyo: the next week has begun there.
    expect(scheduledPeriod('weekly', instant, 'Asia/Tokyo').periodStart).toBe('2026-09-21')
  })
})

describe('scheduledPeriod — monthly', () => {
  it('covers the whole calendar month the run falls in', () => {
    const period = scheduledPeriod('monthly', new Date('2026-09-30T21:00:00Z'), 'UTC')

    expect(period.periodStart).toBe('2026-09-01')
    expect(period.periodEnd).toBe('2026-09-30')
    expect(period.type).toBe('monthly')
  })

  it('knows the length of every month, February included', () => {
    expect(scheduledPeriod('monthly', new Date('2027-02-28T12:00:00Z'), 'UTC').periodEnd).toBe(
      '2027-02-28',
    )
    // 2028 is a leap year.
    expect(scheduledPeriod('monthly', new Date('2028-02-29T12:00:00Z'), 'UTC').periodEnd).toBe(
      '2028-02-29',
    )
    expect(scheduledPeriod('monthly', new Date('2026-12-31T12:00:00Z'), 'UTC').periodEnd).toBe(
      '2026-12-31',
    )
  })

  it('never produces an inverted period, whatever the day', () => {
    for (let day = 1; day <= 28; day += 1) {
      const date = new Date(`2026-02-${String(day).padStart(2, '0')}T12:00:00Z`)
      for (const kind of ['weekly', 'monthly'] as const) {
        const period = scheduledPeriod(kind, date, 'UTC')
        expect(period.periodStart <= period.periodEnd).toBe(true)
      }
    }
  })
})

describe('calendarDay', () => {
  it('is the reader’s day, not UTC’s', () => {
    const instant = new Date('2026-01-01T02:00:00Z')
    expect(calendarDay(instant, 'UTC')).toBe('2026-01-01')
    expect(calendarDay(instant, 'America/New_York')).toBe('2025-12-31')
  })
})
