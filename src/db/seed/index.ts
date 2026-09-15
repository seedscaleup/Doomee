import { isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { uuidv7 } from 'uuidv7'
import {
  actionCategories,
  actionTypes,
  channels,
  industries,
  metrics,
  objectiveTypes,
} from '../schema'
import { ACTION_CATEGORY_SEED, ACTION_TYPE_SEED, CHANNEL_SEED } from './action-taxonomies'
import { INDUSTRY_SEED } from './industries'
import { METRIC_SEED } from './metrics'
import { OBJECTIVE_TYPE_SEED } from './objective-taxonomies'

type TaxonomyEntry = { code: string; labels: { fr: string; en: string }; sortOrder: number }

/** One connection, not a pool: seeding runs once, as the migrator. */
const seedDb = (client: Client) => drizzle(client)
type SeedDb = ReturnType<typeof seedDb>

/**
 * Every reference table has the same shape (ADR-010), so seeding a new one is
 * adding a line below rather than writing another loop.
 *
 * A union of the four table types, not `any`: the columns this file touches are
 * checked, so renaming `sort_order` breaks the build instead of the seed.
 */
type TaxonomyTable =
  | typeof industries
  | typeof actionTypes
  | typeof actionCategories
  | typeof channels
  | typeof objectiveTypes

const TABLES: readonly { table: TaxonomyTable; entries: readonly TaxonomyEntry[] }[] = [
  { table: industries, entries: INDUSTRY_SEED },
  { table: actionTypes, entries: ACTION_TYPE_SEED },
  { table: actionCategories, entries: ACTION_CATEGORY_SEED },
  { table: channels, entries: CHANNEL_SEED },
  { table: objectiveTypes, entries: OBJECTIVE_TYPE_SEED },
]

/**
 * Seeds the system reference data.
 *
 * Idempotent by construction: it matches on `code` among the SYSTEM rows
 * (organization_id IS NULL), so running it on every deploy is safe and adding
 * an entry to a list is enough to ship it. It never touches an organisation's
 * own entries — those belong to the organisation, including the right to have
 * a row with the same code.
 *
 * Runs as the migrator, because a system row has organization_id NULL and no
 * tenant context could ever satisfy that.
 */
export async function seedSystemData(connectionString: string): Promise<{ inserted: number }> {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    const db = seedDb(client)
    let inserted = 0

    for (const { table, entries } of TABLES) {
      inserted += await seedTable(db, table, entries)
    }

    // Metrics carry more than a label — aggregation, direction, formula — so
    // they get their own pass rather than a wider shared type that only one
    // table would use.
    inserted += await seedMetrics(db)

    return { inserted }
  } finally {
    await client.end()
  }
}

async function seedTable(
  db: SeedDb,
  table: TaxonomyTable,
  entries: readonly TaxonomyEntry[],
): Promise<number> {
  const existing = await db
    .select({ code: table.code })
    .from(table)
    .where(isNull(table.organizationId))

  const known = new Set(existing.map((row) => row.code))
  const missing = entries.filter((entry) => !known.has(entry.code))

  if (missing.length > 0) {
    await db.insert(table).values(
      missing.map((entry) => ({
        id: uuidv7(),
        organizationId: null,
        code: entry.code,
        labels: entry.labels,
        sortOrder: entry.sortOrder,
      })),
    )
  }

  // Labels and order can change without the code changing — a wording fix
  // should reach existing installations too.
  for (const entry of entries) {
    await db
      .update(table)
      .set({ labels: entry.labels, sortOrder: entry.sortOrder })
      .where(sql`${table.organizationId} IS NULL AND ${table.code} = ${entry.code}`)
  }

  return missing.length
}

async function seedMetrics(db: SeedDb): Promise<number> {
  const existing = await db
    .select({ code: metrics.code })
    .from(metrics)
    .where(isNull(metrics.organizationId))

  const known = new Set(existing.map((row) => row.code))
  const missing = METRIC_SEED.filter((entry) => !known.has(entry.code))

  if (missing.length > 0) {
    await db.insert(metrics).values(
      missing.map((entry) => ({
        id: uuidv7(),
        organizationId: null,
        code: entry.code,
        labels: entry.labels,
        unit: entry.unit ?? null,
        kind: entry.kind,
        aggregation: entry.aggregation,
        direction: entry.direction,
        decimals: entry.decimals,
        isComputed: entry.isComputed ?? false,
        formula: entry.formula ?? null,
        sortOrder: entry.sortOrder,
      })),
    )
  }

  // Everything but the code can be corrected in place: a metric whose direction
  // was wrong has been scoring objectives backwards, and the fix has to reach
  // installations that already have the row.
  for (const entry of METRIC_SEED) {
    await db
      .update(metrics)
      .set({
        labels: entry.labels,
        unit: entry.unit ?? null,
        kind: entry.kind,
        aggregation: entry.aggregation,
        direction: entry.direction,
        decimals: entry.decimals,
        isComputed: entry.isComputed ?? false,
        formula: entry.formula ?? null,
        sortOrder: entry.sortOrder,
      })
      .where(sql`${metrics.organizationId} IS NULL AND ${metrics.code} = ${entry.code}`)
  }

  return missing.length
}

if (process.argv[1]?.endsWith('seed/index.ts')) {
  const url = process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_AUTH_URL or DATABASE_URL is required to seed')

  seedSystemData(url).then(
    ({ inserted }) => console.warn(`Seed complete. ${inserted} new system entries.`),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
