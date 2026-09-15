import { describe, expect, it } from 'vitest'
import {
  formatDecimalString,
  isEmptySection,
  labelKeysOf,
  preferencesFor,
  presentSection,
  type ReportBlock,
  resolveLabels,
} from '@/modules/reports/present'
import { SECTION_KEYS } from '@/modules/reports/service'

const fr = preferencesFor('fr', 'UTC')
const en = preferencesFor('en', 'UTC')

/** Shorthand: the first table in a section's blocks. */
function tableOf(blocks: ReportBlock[]) {
  const table = blocks.find((block) => block.kind === 'table')
  if (table?.kind !== 'table') throw new Error('no table block')
  return table
}

function statsOf(blocks: ReportBlock[]) {
  const stats = blocks.find((block) => block.kind === 'stats')
  if (stats?.kind !== 'stats') throw new Error('no stats block')
  return stats
}

describe('presentSection — every key answers', () => {
  it.each(SECTION_KEYS)('%s survives empty data', (key) => {
    const blocks = presentSection(key, {}, fr)
    expect(Array.isArray(blocks)).toBe(true)
    expect(isEmptySection(blocks)).toBe(true)
  })

  it.each(SECTION_KEYS)('%s survives data of the wrong shape', (key) => {
    // A provider failed and left `null`; a snapshot from an older version has
    // a field that moved. Neither may throw on a client's screen (R7).
    expect(() => presentSection(key, null, fr)).not.toThrow()
    expect(() => presentSection(key, { objectives: 'not a list' }, fr)).not.toThrow()
    expect(() => presentSection(key, [1, 2, 3], fr)).not.toThrow()
  })
})

describe('executive summary', () => {
  it('counts what the provider found', () => {
    const stats = statsOf(
      presentSection(
        'executive_summary',
        {
          actions_done: 12,
          deliverables_delivered: 3,
          results_recorded: 7,
          insights_written: 2,
        },
        fr,
      ),
    )

    expect(stats.items.map((item) => item.value)).toEqual(['12', '3', '7', '2'])
    expect(stats.items.map((item) => item.labelKey)).toEqual([
      'actionsDone',
      'deliverablesDelivered',
      'resultsRecorded',
      'insightsWritten',
    ])
  })

  it('reads a missing figure as zero, not as blank', () => {
    const stats = statsOf(presentSection('executive_summary', {}, fr))
    expect(stats.items.every((item) => item.value === '0')).toBe(true)
  })
})

describe('objectives — a status is a KEY, never a word', () => {
  it('carries the entity with the value', () => {
    const table = tableOf(
      presentSection(
        'objectives',
        { objectives: [{ title: 'Leads', status: 'achieved', target_value: '100' }] },
        fr,
      ),
    )

    expect(table.rows[0]?.[4]).toEqual({ key: 'status.objective.achieved', tone: 'muted' })
  })

  it('never emits a bare status key that two entities could claim', () => {
    const deliverables = tableOf(
      presentSection('deliverables', { deliverables: [{ title: 'Post', status: 'approved' }] }, fr),
    )

    expect(deliverables.rows[0]?.[1]).toEqual({ key: 'status.deliverable.approved', tone: 'muted' })
  })
})

describe('achievement', () => {
  it('is missing, not zero, when the objective has no percentage', () => {
    const table = tableOf(presentSection('objectives', { objectives: [{ title: 'x' }] }, fr))
    expect(table.rows[0]?.[3]).toEqual({ text: '—', tone: 'muted' })
  })

  it('tones a reached objective green and a badly missed one red', () => {
    const table = tableOf(
      presentSection(
        'objectives',
        {
          objectives: [
            { title: 'reached', achievement_percent: '104' },
            { title: 'half', achievement_percent: '62' },
            { title: 'missed', achievement_percent: '12' },
          ],
        },
        fr,
      ),
    )

    expect(table.rows[0]?.[3]?.tone).toBe('success')
    expect(table.rows[1]?.[3]?.tone).toBeUndefined()
    expect(table.rows[2]?.[3]?.tone).toBe('danger')
  })
})

/**
 * ADR-047, in the only place a reader ever sees it: a cost per lead BELOW
 * target is the best number on the page, and printing it in red would say the
 * opposite of what happened.
 */
describe('the gap reads the metric direction', () => {
  const row = (direction: string) => ({
    title: 'Cost per lead',
    target_value: '10',
    current_value: '7',
    direction,
  })

  it('treats under target as a win when lower is better', () => {
    const table = tableOf(
      presentSection('objectives_comparison', { objectives: [row('down')] }, fr),
    )
    expect(table.rows[0]?.[3]).toEqual({ text: '-3', tone: 'success' })
  })

  it('treats the same number as a miss when higher is better', () => {
    const table = tableOf(presentSection('objectives_comparison', { objectives: [row('up')] }, fr))
    expect(table.rows[0]?.[3]).toEqual({ text: '-3', tone: 'danger' })
  })

  it('refuses to invent a gap it cannot compute', () => {
    const table = tableOf(
      presentSection(
        'objectives_comparison',
        { objectives: [{ title: 'x', current_value: '7', direction: 'up' }] },
        fr,
      ),
    )
    expect(table.rows[0]?.[3]).toEqual({ text: '—', tone: 'muted' })
  })
})

describe('results', () => {
  it('prints a measurement at the metric’s own precision, from its string', () => {
    const table = tableOf(
      presentSection(
        'results',
        {
          metrics: [
            {
              code: 'cpl',
              labels: { fr: 'Coût par lead', en: 'Cost per lead' },
              total: '12.3456',
              decimals: 2,
              currency: 'EUR',
              samples: 4,
            },
          ],
        },
        fr,
      ),
    )

    expect(table.rows[0]?.[0]).toEqual({ text: 'Coût par lead' })
    expect(table.rows[0]?.[1]?.text).toContain('EUR')
    expect(table.rows[0]?.[1]?.text).toMatch(/12,35/)
  })

  it('reads the label in the REPORT’s language, not the reader’s', () => {
    const data = {
      metrics: [{ code: 'cpl', labels: { fr: 'Coût par lead', en: 'Cost per lead' }, total: '1' }],
    }

    expect(tableOf(presentSection('results', data, en)).rows[0]?.[0]).toEqual({
      text: 'Cost per lead',
    })
  })

  it('falls back to the metric code when the label has no translation', () => {
    const table = tableOf(presentSection('results', { metrics: [{ code: 'cpl', total: '1' }] }, fr))
    expect(table.rows[0]?.[0]).toEqual({ text: 'cpl' })
  })

  /**
   * ADR-050: a `numeric(20,4)` arrives as a STRING because a double has only
   * 15–17 significant digits. The conversion happens at the display edge and
   * nowhere earlier — this is that edge, and it must not round before it.
   */
  it('does not lose precision that fits the metric’s decimals', () => {
    const table = tableOf(
      presentSection(
        'results',
        { metrics: [{ code: 'x', total: '9007199254740.9931', decimals: 4 }] },
        en,
      ),
    )
    expect(table.rows[0]?.[1]?.text).toContain('9,007,199,254,740.9931')
  })
})

describe('attention points', () => {
  it('ranks a critical risk as danger and a low one as muted', () => {
    const table = tableOf(
      presentSection(
        'attention_points',
        {
          overdueActions: 4,
          risks: [
            { title: 'Budget', level: 'critical' },
            { title: 'Scope', level: 'low' },
          ],
        },
        fr,
      ),
    )

    expect(table.rows[0]?.[1]).toEqual({ key: 'riskLevel.critical', tone: 'danger' })
    expect(table.rows[1]?.[1]).toEqual({ key: 'riskLevel.low', tone: 'muted' })
  })
})

describe('insights', () => {
  /** ADR-065: `what_didnt` is not in the provider, so it cannot be in a block. */
  it('shows only what worked, what was learned and what is recommended', () => {
    const blocks = presentSection(
      'insights',
      {
        insights: [
          {
            title: 'Carousels',
            what_worked: 'The format',
            what_we_learned: 'Short beats long',
            recommendation: 'Do more',
          },
        ],
      },
      fr,
    )

    const notes = blocks.find((block) => block.kind === 'notes')
    expect(notes?.kind === 'notes' && notes.items.map((item) => item.body)).toEqual([
      'The format',
      'Short beats long',
      'Do more',
    ])
  })

  it('drops the boxes nobody filled rather than printing empty notes', () => {
    const blocks = presentSection('insights', { insights: [{ title: 'Empty' }] }, fr)
    expect(isEmptySection(blocks)).toBe(true)
  })
})

describe('dates', () => {
  it('renders a calendar day in the report’s locale, without shifting it', () => {
    const table = tableOf(
      presentSection(
        'next_steps',
        { nextActions: [{ title: 'Ship', due_date: '2026-01-31' }] },
        fr,
      ),
    )
    expect(table.rows[0]?.[1]?.text).toBe('31/01/2026')

    const english = tableOf(
      presentSection(
        'next_steps',
        { nextActions: [{ title: 'Ship', due_date: '2026-01-31' }] },
        en,
      ),
    )
    expect(english.rows[0]?.[1]?.text).toBe('31/01/2026')
  })

  it('leaves an absent date blank rather than printing the epoch', () => {
    const table = tableOf(presentSection('next_steps', { nextActions: [{ title: 'Ship' }] }, fr))
    expect(table.rows[0]?.[1]?.text).toBe('')
  })
})

describe('isEmptySection', () => {
  it('is true only when every block would print nothing', () => {
    expect(isEmptySection([{ kind: 'stats', items: [] }])).toBe(true)
    expect(
      isEmptySection([
        { kind: 'stats', items: [] },
        { kind: 'table', columnKeys: ['title'], rows: [[{ text: 'x' }]] },
      ]),
    ).toBe(false)
  })
})

/**
 * ============================================================================
 * `formatDecimalString` — the reason ADR-050 keeps a measurement as a string.
 *
 * Every case below is a figure a `number` would get wrong, or a carry that a
 * naive string truncation would get wrong. They are the arithmetic a report's
 * credibility rests on.
 * ============================================================================
 */
describe('formatDecimalString', () => {
  it('keeps digits a double cannot hold', () => {
    expect(formatDecimalString('9007199254740993.1234', 4, 'en')).toBe('9,007,199,254,740,993.1234')
    // The same value through a double, for contrast.
    expect(String(Number('9007199254740993.1234'))).not.toContain('993.1234')
  })

  it('rounds half up rather than truncating', () => {
    expect(formatDecimalString('12.3456', 2, 'fr')).toBe('12,35')
    expect(formatDecimalString('12.3449', 2, 'fr')).toBe('12,34')
    expect(formatDecimalString('0.5', 0, 'en')).toBe('1')
    expect(formatDecimalString('0.4', 0, 'en')).toBe('0')
  })

  it('carries a run of nines into the whole part', () => {
    expect(formatDecimalString('9.99', 1, 'en')).toBe('10.0')
    expect(formatDecimalString('999.999', 2, 'en')).toBe('1,000.00')
    expect(formatDecimalString('0.999', 2, 'en')).toBe('1.00')
  })

  it('pads a short fraction to the metric’s precision', () => {
    expect(formatDecimalString('7', 2, 'en')).toBe('7.00')
    expect(formatDecimalString('7.5', 4, 'en')).toBe('7.5000')
  })

  it('asks Intl for the separator and the grouping, in both languages', () => {
    expect(formatDecimalString('1234567.5', 1, 'en')).toBe('1,234,567.5')
    expect(formatDecimalString('1234567.5', 1, 'fr')).toMatch(/^1.234.567,5$/)
  })

  it('keeps a negative sign, and drops it when the value rounds to zero', () => {
    expect(formatDecimalString('-3.25', 1, 'en')).toBe('-3.3')
    // "-0.00" is a figure nobody wants to read in a report.
    expect(formatDecimalString('-0.004', 2, 'en')).toBe('0.00')
  })

  it('refuses anything that is not a decimal, rather than guessing', () => {
    expect(formatDecimalString('', 2, 'en')).toBeNull()
    expect(formatDecimalString('1e5', 2, 'en')).toBeNull()
    expect(formatDecimalString('abc', 2, 'en')).toBeNull()
    expect(formatDecimalString(null, 2, 'en')).toBeNull()
    expect(formatDecimalString({ value: 1 }, 2, 'en')).toBeNull()
  })
})

describe('actions', () => {
  it('counts by status and lists what was completed', () => {
    const blocks = presentSection(
      'actions',
      {
        byStatus: [
          { status: 'done', count: 9 },
          { status: 'blocked', count: 1 },
        ],
        completed: [{ title: 'Launch', completed_at: '2026-09-18' }],
      },
      fr,
    )

    expect(statsOf(blocks).items).toEqual([
      { labelKey: 'status.action.done', value: '9' },
      { labelKey: 'status.action.blocked', value: '1' },
    ])
    expect(tableOf(blocks).rows[0]).toEqual([
      { text: 'Launch' },
      { text: '18/09/2026', tone: 'muted' },
    ])
  })

  it('renders a timestamp column that arrives as a Date, not a string', () => {
    const table = tableOf(
      presentSection(
        'actions',
        { completed: [{ title: 'Launch', completed_at: new Date('2026-09-18T22:00:00Z') }] },
        fr,
      ),
    )
    expect(table.rows[0]?.[1]?.text).toBe('18/09/2026')
  })
})

describe('analysis and recommendations', () => {
  it('keeps the team’s own words, dated', () => {
    const blocks = presentSection(
      'analysis',
      {
        analyses: [
          { title: 'Semaine 38', recorded_for: '2026-09-18', analysis: 'Le reach a doublé.' },
        ],
      },
      fr,
    )

    const notes = blocks.find((block) => block.kind === 'notes')
    expect(notes?.kind === 'notes' && notes.items[0]).toEqual({
      title: 'Semaine 38 · 18/09/2026',
      body: 'Le reach a doublé.',
    })
  })

  it('lists recommendations from insights and results alike', () => {
    const blocks = presentSection(
      'recommendations',
      {
        recommendations: [
          { title: 'Carousels', recommendation: 'Double down', source: 'insight' },
          { title: 'Ads', recommendation: 'Cut the budget', source: 'result' },
        ],
      },
      fr,
    )

    const notes = blocks.find((block) => block.kind === 'notes')
    expect(notes?.kind === 'notes' && notes.items.map((item) => item.title)).toEqual([
      'Carousels',
      'Ads',
    ])
  })
})

/**
 * ============================================================================
 * `resolveLabels` — the fix the lot's E2E criterion forced.
 *
 * The editor used to translate its own headings with the READER's catalogue,
 * so a French agency saw "Résumé exécutif" above a section whose PDF said
 * "Executive summary". They would have been approving a document they had
 * never read.
 * ============================================================================
 */
describe('resolveLabels', () => {
  const blocks = presentSection(
    'objectives',
    { objectives: [{ title: 'Leads', status: 'achieved', achievement_percent: '100' }] },
    fr,
  )

  it('words a block in the report’s language, not the reader’s', () => {
    expect(resolveLabels('fr', blocks).title).toBe('Intitulé')
    expect(resolveLabels('en', blocks).title).toBe('Title')
  })

  it('resolves the keys cells carry, not only the column headers', () => {
    expect(resolveLabels('en', blocks)['status.objective.achieved']).toBe('Achieved')
    expect(resolveLabels('fr', blocks)['status.objective.achieved']).toBe('Atteint')
  })

  it('covers exactly the keys the blocks will ask for', () => {
    expect(new Set(Object.keys(resolveLabels('fr', blocks)))).toEqual(new Set(labelKeysOf(blocks)))
  })

  it('never leaves a key unanswered, for any section in either language', () => {
    for (const key of SECTION_KEYS) {
      const sample = presentSection(
        key,
        {
          objectives: [{ title: 'x', status: 'achieved', direction: 'up' }],
          byStatus: [{ status: 'done', count: 1 }],
          completed: [{ title: 'x' }],
          deliverables: [{ title: 'x', status: 'approved' }],
          metrics: [{ code: 'x', total: '1' }],
          risks: [{ title: 'x', level: 'critical' }],
          overdueActions: 1,
          nextActions: [{ title: 'x' }],
          actions_done: 1,
        },
        fr,
      )

      for (const locale of ['fr', 'en'] as const) {
        const labels = resolveLabels(locale, sample)
        for (const [labelKey, value] of Object.entries(labels)) {
          // A key that resolved to its own last segment is a MISSING
          // translation, which is what this assertion is here to catch.
          expect(value, `${locale}: ${labelKey}`).not.toBe(labelKey.split('.').at(-1))
        }
      }
    }
  })
})
