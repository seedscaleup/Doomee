import { describe, expect, it } from 'vitest'
import {
  type ActionStatusValue,
  actionCounts,
  actionIsOverdue,
  allowedTransitions,
  bucketByTiming,
  byUrgency,
  canFocus,
  canTransition,
  checkBlocked,
  FOCUS_MAX,
  FOCUS_MIN,
  focusSelection,
  groupByStatus,
  isDone,
  isOpen,
  type PriorityValue,
  statusTone,
  timingOf,
} from '@/modules/actions/service'

const ZONE = 'Africa/Abidjan'
const NOW = new Date('2026-03-14T10:00:00Z')
const TODAY = '2026-03-14'

function action(
  id: string,
  overrides: Partial<{
    status: ActionStatusValue
    priority: PriorityValue
    dueDate: string | null
    title: string
  }> = {},
) {
  return {
    id,
    title: overrides.title ?? id,
    status: overrides.status ?? ('todo' as ActionStatusValue),
    priority: overrides.priority ?? ('normal' as PriorityValue),
    dueDate: overrides.dueDate ?? null,
  }
}

describe('the action status machine', () => {
  it('walks the normal path', () => {
    expect(canTransition('todo', 'in_progress')).toBe(true)
    expect(canTransition('in_progress', 'in_review')).toBe(true)
    expect(canTransition('in_review', 'done')).toBe(true)
  })

  it('lets work be picked up straight from in progress to done', () => {
    // Review is not compulsory: plenty of actions have nothing to review.
    expect(canTransition('in_progress', 'done')).toBe(true)
  })

  it('refuses to jump from not started to done', () => {
    expect(canTransition('todo', 'done')).toBe(false)
    expect(canTransition('todo', 'in_review')).toBe(false)
  })

  it('treats blocked as an interruption that returns to work', () => {
    expect(canTransition('blocked', 'in_progress')).toBe(true)
    expect(canTransition('blocked', 'done')).toBe(false)
  })

  it('never turns a finished action into a cancelled one, or the reverse', () => {
    expect(canTransition('done', 'cancelled')).toBe(false)
    expect(canTransition('cancelled', 'done')).toBe(false)
  })

  it('reopens either of them to active work', () => {
    expect(canTransition('done', 'in_progress')).toBe(true)
    expect(canTransition('cancelled', 'todo')).toBe(true)
  })

  it('accepts a no-op, so saving a form without touching the status works', () => {
    expect(canTransition('blocked', 'blocked')).toBe(true)
  })

  it('offers only moves it would then accept', () => {
    const statuses: ActionStatusValue[] = [
      'todo',
      'in_progress',
      'in_review',
      'done',
      'blocked',
      'cancelled',
    ]
    for (const from of statuses) {
      for (const to of allowedTransitions(from)) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
      }
    }
  })

  it('counts open work as everything not finished and not dropped', () => {
    expect(isOpen('blocked')).toBe(true)
    expect(isOpen('done')).toBe(false)
    expect(isOpen('cancelled')).toBe(false)
  })

  it('counts only done as done — cancelled work was dropped, not delivered', () => {
    expect(isDone('done')).toBe(true)
    expect(isDone('cancelled')).toBe(false)
  })

  it('gives blocked the alarming tone and done the reassuring one', () => {
    expect(statusTone('blocked')).toBe('danger')
    expect(statusTone('done')).toBe('success')
    expect(statusTone('todo')).toBe('neutral')
  })
})

describe('blocking an action', () => {
  it('demands a reason', () => {
    expect(checkBlocked({ status: 'blocked' })).toEqual({ ok: false, reason: 'reason_required' })
    expect(checkBlocked({ status: 'blocked', blockedReason: '   ' })).toEqual({
      ok: false,
      reason: 'reason_required',
    })
  })

  it('accepts one', () => {
    expect(checkBlocked({ status: 'blocked', blockedReason: 'Attente du client' })).toEqual({
      ok: true,
    })
  })

  it('asks nothing of any other status', () => {
    expect(checkBlocked({ status: 'todo' })).toEqual({ ok: true })
  })
})

describe('when an action is late', () => {
  it('is late once the project’s own day has moved past the date', () => {
    expect(actionIsOverdue(action('a', { dueDate: '2026-03-13' }), ZONE, NOW)).toBe(true)
    expect(actionIsOverdue(action('a', { dueDate: TODAY }), ZONE, NOW)).toBe(false)
  })

  it('is never late once it is finished, whatever the date says', () => {
    expect(actionIsOverdue(action('a', { dueDate: '2026-01-01', status: 'done' }), ZONE, NOW)).toBe(
      false,
    )
    expect(
      actionIsOverdue(action('a', { dueDate: '2026-01-01', status: 'cancelled' }), ZONE, NOW),
    ).toBe(false)
  })

  it('reads the day in the project timezone, not the reader’s', () => {
    // 23:30 on the 14th in Abidjan is already the 15th in Paris.
    const evening = new Date('2026-03-14T23:30:00Z')
    const due = action('a', { dueDate: '2026-03-14' })
    expect(actionIsOverdue(due, 'Africa/Abidjan', evening)).toBe(false)
    expect(actionIsOverdue(due, 'Europe/Paris', evening)).toBe(true)
  })
})

describe('where an action sits on the horizon', () => {
  it('sorts the four cases', () => {
    expect(timingOf(action('a', { dueDate: '2026-03-13' }), ZONE, NOW)).toBe('overdue')
    expect(timingOf(action('a', { dueDate: TODAY }), ZONE, NOW)).toBe('today')
    expect(timingOf(action('a', { dueDate: '2026-03-20' }), ZONE, NOW)).toBe('soon')
    expect(timingOf(action('a', { dueDate: '2026-04-30' }), ZONE, NOW)).toBe('later')
  })

  it('counts the seventh day as soon and the eighth as later', () => {
    expect(timingOf(action('a', { dueDate: '2026-03-21' }), ZONE, NOW)).toBe('soon')
    expect(timingOf(action('a', { dueDate: '2026-03-22' }), ZONE, NOW)).toBe('later')
  })

  it('has no horizon for an action with no date, or one already closed', () => {
    expect(timingOf(action('a'), ZONE, NOW)).toBe('none')
    expect(timingOf(action('a', { dueDate: '2026-01-01', status: 'done' }), ZONE, NOW)).toBe('none')
  })
})

describe('the order every list uses', () => {
  it('puts late work first, then today, then the rest', () => {
    const sorted = byUrgency(
      [
        action('later', { dueDate: '2026-05-01' }),
        action('today', { dueDate: TODAY }),
        action('late', { dueDate: '2026-02-01' }),
        action('soon', { dueDate: '2026-03-18' }),
      ],
      ZONE,
      NOW,
    )
    expect(sorted.map((a) => a.id)).toEqual(['late', 'today', 'soon', 'later'])
  })

  it('breaks a tie on priority, then on the nearest deadline', () => {
    const sorted = byUrgency(
      [
        action('normal-soon', { dueDate: '2026-03-16', priority: 'normal' }),
        action('urgent', { dueDate: '2026-03-20', priority: 'urgent' }),
        action('high', { dueDate: '2026-03-20', priority: 'high' }),
      ],
      ZONE,
      NOW,
    )
    expect(sorted.map((a) => a.id)).toEqual(['urgent', 'high', 'normal-soon'])
  })

  it('puts undated work last rather than treating it as urgent', () => {
    const sorted = byUrgency(
      [action('undated'), action('dated', { dueDate: '2026-04-01' })],
      ZONE,
      NOW,
    )
    expect(sorted.map((a) => a.id)).toEqual(['dated', 'undated'])
  })

  it('does not mutate what it was given', () => {
    const input = [action('b', { dueDate: '2026-05-01' }), action('a', { dueDate: TODAY })]
    const before = input.map((a) => a.id)
    byUrgency(input, ZONE, NOW)
    expect(input.map((a) => a.id)).toEqual(before)
  })
})

describe('Focus Mode', () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    action(`a${index}`, { dueDate: `2026-03-${String(10 + index).padStart(2, '0')}` }),
  )

  it('never shows more than five', () => {
    expect(focusSelection(many, ZONE, NOW)).toHaveLength(FOCUS_MAX)
  })

  it('shows the most urgent ones, in order', () => {
    const picked = focusSelection(many, ZONE, NOW).map((a) => a.id)
    expect(picked).toEqual(['a0', 'a1', 'a2', 'a3', 'a4'])
  })

  it('leaves out finished and cancelled work', () => {
    const mixed = [
      action('done', { status: 'done', dueDate: '2026-01-01' }),
      action('cancelled', { status: 'cancelled', dueDate: '2026-01-02' }),
      action('open', { dueDate: '2026-03-20' }),
    ]
    expect(focusSelection(mixed, ZONE, NOW).map((a) => a.id)).toEqual(['open'])
  })

  it('does not open below three: there is nothing to focus on', () => {
    expect(canFocus(FOCUS_MIN - 1)).toBe(false)
    expect(canFocus(FOCUS_MIN)).toBe(true)
  })
})

describe('My Work', () => {
  const mine = [
    action('late', { dueDate: '2026-03-01' }),
    action('today', { dueDate: TODAY }),
    action('soon', { dueDate: '2026-03-18' }),
    action('later', { dueDate: '2026-06-01' }),
    action('undated'),
    action('done', { status: 'done', dueDate: '2026-03-02' }),
  ]

  it('answers the three questions people actually ask', () => {
    const buckets = bucketByTiming(mine, ZONE, NOW)
    expect(buckets.overdue.map((a) => a.id)).toEqual(['late'])
    expect(buckets.today.map((a) => a.id)).toEqual(['today'])
    expect(buckets.soon.map((a) => a.id)).toEqual(['soon'])
  })

  it('keeps undated work visible rather than urgent', () => {
    const buckets = bucketByTiming(mine, ZONE, NOW)
    expect(buckets.later.map((a) => a.id)).toEqual(['later', 'undated'])
  })

  it('leaves finished work out of every bucket', () => {
    const buckets = bucketByTiming(mine, ZONE, NOW)
    const all = [...buckets.overdue, ...buckets.today, ...buckets.soon, ...buckets.later]
    expect(all.map((a) => a.id)).not.toContain('done')
  })
})

describe('the kanban grouping', () => {
  it('puts every action in its column, most urgent first', () => {
    const grouped = groupByStatus(
      [
        action('b', { status: 'todo', dueDate: '2026-05-01' }),
        action('a', { status: 'todo', dueDate: '2026-03-01' }),
        action('c', { status: 'done' }),
      ],
      ZONE,
      NOW,
    )
    expect(grouped.todo.map((x) => x.id)).toEqual(['a', 'b'])
    expect(grouped.done.map((x) => x.id)).toEqual(['c'])
    expect(grouped.blocked).toEqual([])
  })
})

describe('the project counters an action implies', () => {
  it('counts total, done and overdue', () => {
    const counts = actionCounts(
      [
        { status: 'todo', dueDate: '2026-03-01' },
        { status: 'in_progress', dueDate: '2026-05-01' },
        { status: 'done', dueDate: '2026-02-01' },
      ],
      ZONE,
      NOW,
    )
    expect(counts).toEqual({ actionsTotal: 3, actionsDone: 1, actionsOverdue: 1 })
  })

  it('leaves cancelled work out of the denominator', () => {
    // Otherwise a project looks less finished for having dropped what it should.
    const counts = actionCounts(
      [
        { status: 'done', dueDate: null },
        { status: 'cancelled', dueDate: '2026-01-01' },
      ],
      ZONE,
      NOW,
    )
    expect(counts).toEqual({ actionsTotal: 1, actionsDone: 1, actionsOverdue: 0 })
  })

  it('counts nothing on an empty project', () => {
    expect(actionCounts([], ZONE, NOW)).toEqual({
      actionsTotal: 0,
      actionsDone: 0,
      actionsOverdue: 0,
    })
  })
})
