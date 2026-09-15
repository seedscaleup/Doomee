import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import {
  ACTION_CATEGORY_SEED,
  ACTION_TYPE_SEED,
  CHANNEL_SEED,
  type TaxonomySeed,
} from '@/db/seed/action-taxonomies'
import { DELIVERABLE_TYPE_SEED } from '@/db/seed/deliverable-taxonomies'
import { INDUSTRY_SEED } from '@/db/seed/industries'
import { METRIC_SEED } from '@/db/seed/metrics'
import { OBJECTIVE_TYPE_SEED } from '@/db/seed/objective-taxonomies'
import { RESULT_FORM_SEED } from '@/db/seed/result-forms'

/** Every seeded taxonomy, checked by the same rules — a new one is one line. */
const TAXONOMIES: readonly { table: string; entries: readonly TaxonomySeed[] }[] = [
  { table: 'industries', entries: INDUSTRY_SEED },
  { table: 'action_types', entries: ACTION_TYPE_SEED },
  { table: 'action_categories', entries: ACTION_CATEGORY_SEED },
  { table: 'channels', entries: CHANNEL_SEED },
  { table: 'objective_types', entries: OBJECTIVE_TYPE_SEED },
  { table: 'metrics', entries: METRIC_SEED },
  { table: 'deliverable_types', entries: DELIVERABLE_TYPE_SEED },
]

/**
 * Every row a fresh seed inserts: the taxonomies above plus one per smart-form
 * template. The form FIELDS are not counted — they are replaced wholesale each
 * run rather than inserted once, which is what lets a field list be corrected.
 */
const TOTAL =
  TAXONOMIES.reduce((sum, taxonomy) => sum + taxonomy.entries.length, 0) + RESULT_FORM_SEED.length

import { startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * The seed runs on every deploy, so being idempotent is not a nicety: a second
 * run that duplicated every sector would corrupt every client record that
 * referenced one.
 */
describe('system data seed', () => {
  let db: TestDatabase
  let admin: Client

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('inserts every declared entry of every taxonomy on a fresh database', async () => {
    const { inserted } = await seedSystemData(db.adminUrl)
    expect(inserted).toBe(TOTAL)

    for (const { table, entries } of TAXONOMIES) {
      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*) FROM ${table} WHERE organization_id IS NULL`,
      )
      expect(Number(rows[0]?.count), table).toBe(entries.length)
    }
  })

  it('inserts nothing on a second run', async () => {
    const { inserted } = await seedSystemData(db.adminUrl)
    expect(inserted).toBe(0)

    const { rows } = await admin.query<{ count: string }>(
      'SELECT count(*) FROM industries WHERE organization_id IS NULL',
    )
    expect(Number(rows[0]?.count)).toBe(INDUSTRY_SEED.length)
  })

  it('carries a label fix to an existing installation', async () => {
    await admin.query(
      `UPDATE industries SET labels = '{"fr":"périmé","en":"stale"}'::jsonb
        WHERE organization_id IS NULL AND code = 'retail'`,
    )

    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ labels: { fr: string } }>(
      `SELECT labels FROM industries WHERE organization_id IS NULL AND code = 'retail'`,
    )
    expect(rows[0]?.labels.fr).toBe('Distribution et commerce')
  })

  it('never touches an organisation own entries', async () => {
    const { rows: orgRows } = await admin.query<{ id: string }>(
      `INSERT INTO organizations (id, name, slug)
       VALUES (gen_random_uuid(), 'Seed org', 'seed-org') RETURNING id`,
    )
    const organizationId = orgRows[0]?.id

    await admin.query(
      `INSERT INTO industries (id, organization_id, code, labels)
       VALUES (gen_random_uuid(), $1, 'retail', '{"fr":"Le mien","en":"Mine"}'::jsonb)`,
      [organizationId],
    )

    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ labels: { fr: string } }>(
      `SELECT labels FROM industries WHERE organization_id = $1 AND code = 'retail'`,
      [organizationId],
    )
    // Same code as a system entry, different owner: the seed must leave it be.
    expect(rows[0]?.labels.fr).toBe('Le mien')
  })

  it('seeds the six smart forms and wires their fields to metrics', async () => {
    await seedSystemData(db.adminUrl)

    const { rows: templates } = await admin.query<{ code: string; version: number }>(
      'SELECT code, version FROM result_form_templates WHERE organization_id IS NULL',
    )
    expect(templates).toHaveLength(RESULT_FORM_SEED.length)

    for (const template of RESULT_FORM_SEED) {
      const { rows } = await admin.query<{ key: string; metric_id: string | null }>(
        `SELECT f.key, f.metric_id
           FROM result_form_fields f
           JOIN result_form_templates t ON t.id = f.template_id
          WHERE t.code = $1 AND t.organization_id IS NULL
          ORDER BY f.sort_order`,
        [template.code],
      )
      expect(
        rows.map((row) => row.key),
        template.code,
      ).toEqual(template.fields.map((field) => field.key))

      // A field that names a metric must actually resolve to one, or the
      // number it collects is recorded and never counted.
      for (const field of template.fields.filter((item) => item.metric)) {
        const row = rows.find((item) => item.key === field.key)
        expect(row?.metric_id, `${template.code}.${field.key}`).toBeTruthy()
      }
    }
  })

  it('attaches exactly one fallback form, and it is the one without an action type', async () => {
    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ code: string }>(
      `SELECT code FROM result_form_templates
        WHERE organization_id IS NULL AND action_type_id IS NULL`,
    )
    // Every action type without a form of its own falls back here, so "record
    // a result" is never unavailable.
    expect(rows.map((row) => row.code)).toEqual(['generic'])
  })

  it('replaces the fields of a template rather than duplicating them', async () => {
    await seedSystemData(db.adminUrl)
    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM result_form_fields f
         JOIN result_form_templates t ON t.id = f.template_id
        WHERE t.code = 'social_post' AND t.organization_id IS NULL`,
    )
    const expected = RESULT_FORM_SEED.find((item) => item.code === 'social_post')?.fields.length
    expect(Number(rows[0]?.n)).toBe(expected)
  })

  it('gives every metric an aggregation and a direction', async () => {
    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ code: string; aggregation: string; direction: string }>(
      'SELECT code, aggregation, direction FROM metrics WHERE organization_id IS NULL',
    )
    expect(rows).toHaveLength(METRIC_SEED.length)

    // Without these two an objective cannot be scored: "20% below target" is a
    // miss on revenue and a win on cost per lead.
    for (const row of rows) {
      expect(row.aggregation, row.code).toBeTruthy()
      expect(row.direction, row.code).toBeTruthy()
    }
  })

  it('never sums a rate, and never treats a cost as better when higher', async () => {
    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ code: string; aggregation: string; direction: string }>(
      `SELECT code, aggregation, direction FROM metrics
        WHERE organization_id IS NULL AND code IN ('ctr', 'conversion_rate', 'spend', 'cpl', 'bugs')`,
    )
    const byCode = new Map(rows.map((row) => [row.code, row]))

    // Two 3% weeks are not a 6% fortnight.
    expect(byCode.get('ctr')?.aggregation).toBe('avg')
    expect(byCode.get('conversion_rate')?.aggregation).toBe('avg')

    for (const code of ['spend', 'cpl', 'bugs']) {
      expect(byCode.get(code)?.direction, code).toBe('lower_is_better')
    }
  })

  it('gives every computed metric a formula, and no other metric one', () => {
    for (const metric of METRIC_SEED) {
      if (metric.isComputed) expect(metric.formula, metric.code).toBeTruthy()
      else expect(metric.formula, metric.code).toBeUndefined()
    }
  })

  it.each(TAXONOMIES.map((taxonomy) => taxonomy.table))(
    '%s declares no duplicate code and gives every entry both languages',
    (table) => {
      const entries = TAXONOMIES.find((taxonomy) => taxonomy.table === table)?.entries ?? []
      expect(entries.length).toBeGreaterThan(0)

      const codes = entries.map((entry) => entry.code)
      expect(new Set(codes).size).toBe(codes.length)

      for (const entry of entries) {
        expect(entry.labels.fr.length, entry.code).toBeGreaterThan(0)
        expect(entry.labels.en.length, entry.code).toBeGreaterThan(0)
      }
    },
  )
})
