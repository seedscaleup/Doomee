import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  calendarDate,
  canTransition,
  daysUntil,
  isActive,
  isOverdue,
  milestoneStatusFor,
  type ProjectStatusValue,
  priorityTone,
  projectProgress,
  statusTone,
} from '@/modules/projects/service'

describe('the project status machine', () => {
  it('walks the normal path', () => {
    expect(canTransition('to_start', 'in_progress')).toBe(true)
    expect(canTransition('in_progress', 'in_review')).toBe(true)
    expect(canTransition('in_review', 'done')).toBe(true)
  })

  it('treats a pause and a block as interruptions, not endings', () => {
    expect(canTransition('paused', 'in_progress')).toBe(true)
    expect(canTransition('blocked', 'in_progress')).toBe(true)
  })

  it('lets a finished project be reopened', () => {
    expect(canTransition('done', 'in_progress')).toBe(true)
  })

  it('never brings an archived project back by a status change', () => {
    expect(allowedTransitions('archived')).toEqual([])
    expect(canTransition('archived', 'in_progress')).toBe(false)
  })

  it('refuses to skip straight from not-started to done', () => {
    expect(canTransition('to_start', 'done')).toBe(false)
    expect(canTransition('to_start', 'in_review')).toBe(false)
  })

  it('accepts a no-op, so saving a form without touching the status works', () => {
    expect(canTransition('blocked', 'blocked')).toBe(true)
  })

  it('offers only moves it would then accept', () => {
    const statuses: ProjectStatusValue[] = [
      'to_start',
      'in_progress',
      'in_review',
      'paused',
      'blocked',
      'done',
      'archived',
    ]

    for (const from of statuses) {
      for (const to of allowedTransitions(from)) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
      }
    }
  })

  it('counts everything but done and archived as live work', () => {
    expect(isActive('blocked')).toBe(true)
    expect(isActive('done')).toBe(false)
    expect(isActive('archived')).toBe(false)
  })

  it('gives blocked and urgent the alarming tones', () => {
    expect(statusTone('blocked')).toBe('danger')
    expect(statusTone('done')).toBe('success')
    expect(priorityTone('urgent')).toBe('danger')
    expect(priorityTone('low')).toBe('neutral')
  })
})

describe('what day it is, where the project lives', () => {
  it('reads the calendar date in the project timezone, not the reader’s', () => {
    // 23:30 on the 14th in Abidjan (UTC) is already the 15th in Paris.
    const instant = new Date('2026-03-14T23:30:00Z')
    expect(calendarDate(instant, 'Africa/Abidjan')).toBe('2026-03-14')
    expect(calendarDate(instant, 'Europe/Paris')).toBe('2026-03-15')
  })

  it('does not call a deadline missed while the project’s own day lasts', () => {
    const instant = new Date('2026-03-14T23:30:00Z')
    expect(isOverdue('2026-03-14', 'Africa/Abidjan', instant)).toBe(false)
    // …and in Paris that same instant, the 14th is over.
    expect(isOverdue('2026-03-14', 'Europe/Paris', instant)).toBe(true)
  })

  it('survives the daylight saving change that catches manual offsets', () => {
    // Paris moves to UTC+2 on 29 March 2026 at 01:00 UTC.
    const before = new Date('2026-03-29T00:30:00Z')
    const after = new Date('2026-03-29T01:30:00Z')
    expect(calendarDate(before, 'Europe/Paris')).toBe('2026-03-29')
    expect(calendarDate(after, 'Europe/Paris')).toBe('2026-03-29')
  })

  it('has no opinion about a date that was never set', () => {
    expect(isOverdue(null, 'Europe/Paris', new Date())).toBe(false)
    expect(daysUntil(null, 'Europe/Paris', new Date())).toBeNull()
  })

  it('counts the days left, and past zero once late', () => {
    const now = new Date('2026-03-14T10:00:00Z')
    expect(daysUntil('2026-03-20', 'Africa/Abidjan', now)).toBe(6)
    expect(daysUntil('2026-03-14', 'Africa/Abidjan', now)).toBe(0)
    expect(daysUntil('2026-03-10', 'Africa/Abidjan', now)).toBe(-4)
  })
})

describe('a milestone status', () => {
  const now = new Date('2026-03-14T10:00:00Z')

  it('is reached once someone says so, whatever the date said', () => {
    expect(
      milestoneStatusFor({ dueDate: '2026-01-01', reachedAt: new Date() }, 'Europe/Paris', now),
    ).toBe('reached')
  })

  it('is missed when the day has passed and nobody reached it', () => {
    expect(
      milestoneStatusFor({ dueDate: '2026-03-13', reachedAt: null }, 'Europe/Paris', now),
    ).toBe('missed')
  })

  it('is still upcoming on the day itself', () => {
    expect(
      milestoneStatusFor({ dueDate: '2026-03-14', reachedAt: null }, 'Europe/Paris', now),
    ).toBe('upcoming')
  })

  it('is upcoming with no date at all', () => {
    expect(milestoneStatusFor({ dueDate: null, reachedAt: null }, 'Europe/Paris', now)).toBe(
      'upcoming',
    )
  })
})

describe('how far along a project is', () => {
  const none = { actionsTotal: 0, actionsDone: 0, milestonesTotal: 0, milestonesReached: 0 }

  it('is zero when nothing has been planned', () => {
    expect(projectProgress(none)).toBe(0)
  })

  it('counts actions once there are any', () => {
    expect(projectProgress({ ...none, actionsTotal: 4, actionsDone: 1 })).toBe(25)
  })

  it('falls back to milestones for a project not yet broken down', () => {
    expect(projectProgress({ ...none, milestonesTotal: 4, milestonesReached: 3 })).toBe(75)
  })

  it('prefers actions over milestones when both exist', () => {
    expect(
      projectProgress({
        actionsTotal: 10,
        actionsDone: 10,
        milestonesTotal: 4,
        milestonesReached: 0,
      }),
    ).toBe(100)
  })

  it('never rounds an unfinished project up to 100', () => {
    // 199/200 is 99.5%, and a bar at 100% on unfinished work is a lie.
    expect(projectProgress({ ...none, actionsTotal: 200, actionsDone: 199 })).toBe(99)
  })

  it('never rounds started work down to 0', () => {
    expect(projectProgress({ ...none, actionsTotal: 500, actionsDone: 1 })).toBe(1)
  })

  it('refuses to report more than finished, or less than nothing', () => {
    expect(projectProgress({ ...none, actionsTotal: 3, actionsDone: 9 })).toBe(100)
    expect(projectProgress({ ...none, actionsTotal: 3, actionsDone: -2 })).toBe(0)
  })
})
