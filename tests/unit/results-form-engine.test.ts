import { describe, expect, it } from 'vitest'
import {
  answeredValues,
  buildFormSchema,
  type FormField,
  metricValuesOf,
  orderedFields,
} from '@/modules/results/form-engine'

function field(overrides: Partial<FormField> & Pick<FormField, 'key' | 'kind'>): FormField {
  return {
    labels: { fr: overrides.key, en: overrides.key },
    isRequired: false,
    sortOrder: 0,
    ...overrides,
  }
}

describe('the schema built from a template', () => {
  const fields = [
    field({ key: 'impressions', kind: 'number', min: '0', metricCode: 'impressions' }),
    field({ key: 'score', kind: 'number', min: '0', max: '100' }),
    field({ key: 'post_url', kind: 'url' }),
    field({ key: 'happened_on', kind: 'date' }),
    field({
      key: 'format',
      kind: 'select',
      options: [
        { value: 'article', labels: { fr: 'Article', en: 'Article' } },
        { value: 'video', labels: { fr: 'Vidéo', en: 'Video' } },
      ],
    }),
    field({ key: 'notes', kind: 'longtext' }),
  ]
  const schema = buildFormSchema(fields)

  it('accepts what the template declares', () => {
    const result = schema.safeParse({
      impressions: '1000',
      score: '87',
      post_url: 'https://example.test/post',
      happened_on: '2026-03-14',
      format: 'video',
      notes: 'Bon engagement',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a form where nothing was filled in', () => {
    // Almost nothing is required: a result nobody can finish is a result
    // nobody records.
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ impressions: '', post_url: '' }).success).toBe(true)
  })

  it('refuses a key the template does not declare', () => {
    // A stale form, or someone posting by hand. `field_key` is meant to be the
    // audit trail of a number, so it has to match the template.
    expect(schema.safeParse({ impressions: '10', smuggled: '1' }).success).toBe(false)
  })

  it('refuses a number outside the declared bounds', () => {
    expect(schema.safeParse({ score: '101' }).success).toBe(false)
    expect(schema.safeParse({ score: '-1' }).success).toBe(false)
    expect(schema.safeParse({ score: '100' }).success).toBe(true)
  })

  it('refuses text where a number is declared', () => {
    expect(schema.safeParse({ impressions: 'beaucoup' }).success).toBe(false)
  })

  it('refuses a select value outside its options', () => {
    expect(schema.safeParse({ format: 'podcast' }).success).toBe(false)
  })

  it('refuses a malformed url and a malformed date', () => {
    expect(schema.safeParse({ post_url: 'not a url' }).success).toBe(false)
    expect(schema.safeParse({ happened_on: '14/03/2026' }).success).toBe(false)
  })

  it('keeps a long decimal as a string rather than rounding it', () => {
    // numeric(20,4) can hold what a JS number cannot: the value stays textual
    // all the way to the column (CLAUDE.md §7 — jamais de float).
    const parsed = schema.parse({ impressions: '9007199254740993.1234' })
    expect(parsed.impressions).toBe('9007199254740993.1234')
  })

  it('enforces a field the template DOES mark required', () => {
    const required = buildFormSchema([field({ key: 'outcome', kind: 'text', isRequired: true })])
    expect(required.safeParse({}).success).toBe(false)
    expect(required.safeParse({ outcome: '' }).success).toBe(false)
    expect(required.safeParse({ outcome: 'livré' }).success).toBe(true)
  })
})

describe('what gets stored', () => {
  it('keeps the answered questions and drops the rest', () => {
    expect(answeredValues({ a: '10', b: '', c: '   ', d: undefined, e: ' 5 ' })).toEqual({
      a: '10',
      e: '5',
    })
  })

  it('reads metric values only from fields wired to a metric', () => {
    const fields = [
      field({ key: 'impressions', kind: 'number', metricCode: 'impressions' }),
      field({ key: 'pieces', kind: 'number' }),
    ]
    expect(metricValuesOf(fields, { impressions: '1000', pieces: '3' })).toEqual({
      impressions: 1000,
    })
  })

  it('ignores an unparsable value rather than storing NaN', () => {
    const fields = [field({ key: 'impressions', kind: 'number', metricCode: 'impressions' })]
    expect(metricValuesOf(fields, { impressions: 'beaucoup' })).toEqual({})
  })

  it('orders fields the way the template declares, then by key', () => {
    const fields = [
      field({ key: 'b', kind: 'text', sortOrder: 20 }),
      field({ key: 'a', kind: 'text', sortOrder: 20 }),
      field({ key: 'first', kind: 'text', sortOrder: 10 }),
    ]
    expect(orderedFields(fields).map((item) => item.key)).toEqual(['first', 'a', 'b'])
  })
})
