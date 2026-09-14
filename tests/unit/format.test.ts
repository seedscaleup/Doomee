import { describe, expect, it } from 'vitest'
import {
  calendarDaysBetween,
  type FormatPreferences,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeDays,
  isOverdue,
} from '@/lib/format'

const FR: FormatPreferences = { locale: 'fr', timezone: 'Europe/Paris', dateFormat: 'dd/MM/yyyy' }
const EN: FormatPreferences = { locale: 'en', timezone: 'Europe/London', dateFormat: 'dd/MM/yyyy' }
const ABIDJAN: FormatPreferences = {
  locale: 'fr',
  timezone: 'Africa/Abidjan',
  dateFormat: 'dd/MM/yyyy',
}

describe('dates', () => {
  it('renders the reader own day, not the UTC day', () => {
    // 22:30 UTC on 14 September is already 15 September in Paris.
    const instant = new Date('2026-09-14T22:30:00Z')
    expect(formatDate(instant, FR)).toBe('15/09/2026')
    expect(formatDate(instant, ABIDJAN)).toBe('14/09/2026')
  })

  it('formats in the requested locale', () => {
    const instant = new Date('2026-03-02T12:00:00Z')
    expect(formatDate(instant, FR)).toBe('02/03/2026')
    expect(formatDate(instant, EN)).toBe('02/03/2026')
  })
})

describe('money (ADR-024)', () => {
  it('lets the data decide the currency and the locale decide the format', () => {
    const amount = 5_000_000
    expect(formatMoney(amount, 'XOF', FR)).toContain('5')
    expect(formatMoney(amount, 'XOF', FR)).toMatch(/F|XOF/)
    expect(formatMoney(1234.5, 'EUR', FR)).toMatch(/€/)
    expect(formatMoney(1234.5, 'USD', EN)).toMatch(/\$/)
  })

  it('renders the same amount differently per locale, same currency', () => {
    const fr = formatMoney(1234.5, 'EUR', FR)
    const en = formatMoney(1234.5, 'EUR', EN)
    expect(fr).not.toBe(en)
  })

  it('gives XOF no decimals, because it has no minor unit', () => {
    expect(formatMoney(1500, 'XOF', FR)).not.toMatch(/[.,]00/)
  })
})

describe('numbers and percentages', () => {
  it('groups thousands per locale', () => {
    expect(formatNumber(1234567, EN)).toBe('1,234,567')
    expect(formatNumber(1234567, FR).replace(/ | /g, ' ')).toBe('1 234 567')
  })

  it('renders a ratio as a percentage', () => {
    expect(formatPercent(0.2, EN)).toBe('20%')
    expect(formatPercent(0.1234, EN, 1)).toBe('12.3%')
  })
})

describe('calendar arithmetic (risk R9)', () => {
  /**
   * These are the tests that stop "due today" reading as "due yesterday" for
   * someone whose day has not started in UTC yet.
   */
  it('counts whole days in the reader zone', () => {
    const now = new Date('2026-09-14T23:00:00Z') // 15 Sept in Paris
    const due = new Date('2026-09-15T06:00:00Z') // 15 Sept in Paris
    expect(calendarDaysBetween(now, due, 'Europe/Paris')).toBe(0)
    expect(calendarDaysBetween(now, due, 'Africa/Abidjan')).toBe(1)
  })

  it('does not call today overdue', () => {
    const now = new Date('2026-09-14T23:30:00Z')
    const due = new Date('2026-09-15T00:30:00Z')
    expect(isOverdue(due, now, 'Europe/Paris')).toBe(false)
  })

  it('calls yesterday overdue', () => {
    const now = new Date('2026-09-15T08:00:00Z')
    const due = new Date('2026-09-14T08:00:00Z')
    expect(isOverdue(due, now, 'Europe/Paris')).toBe(true)
  })

  it('stays correct across a daylight-saving change', () => {
    // Paris moves off summer time on 25 October 2026.
    const before = new Date('2026-10-24T12:00:00Z')
    const after = new Date('2026-10-26T12:00:00Z')
    expect(calendarDaysBetween(before, after, 'Europe/Paris')).toBe(2)
  })

  it('stays correct in a half-hour offset zone', () => {
    const from = new Date('2026-09-14T20:00:00Z') // 15 Sept 01:30 in Kolkata
    const to = new Date('2026-09-15T20:00:00Z')
    expect(calendarDaysBetween(from, to, 'Asia/Kolkata')).toBe(1)
  })
})

describe('relative days', () => {
  it.each([
    ['fr', 'Europe/Paris', 1, /demain/i],
    ['en', 'Europe/London', 1, /tomorrow/i],
    ['fr', 'Europe/Paris', -1, /hier/i],
    ['en', 'Europe/London', -1, /yesterday/i],
  ] as const)('renders %s %s offset %i', (locale, timezone, offset, pattern) => {
    const now = new Date('2026-09-14T12:00:00Z')
    const target = new Date(now.getTime() + offset * 86_400_000)
    const preferences: FormatPreferences = { locale, timezone, dateFormat: 'dd/MM/yyyy' }
    expect(formatRelativeDays(target, now, preferences)).toMatch(pattern)
  })

  it('says today rather than "in 0 days"', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    expect(formatRelativeDays(now, now, EN)).toMatch(/today/i)
  })
})
