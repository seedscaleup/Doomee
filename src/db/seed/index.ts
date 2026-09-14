import { isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { uuidv7 } from 'uuidv7'
import { industries } from '../schema'
import { INDUSTRY_SEED } from './industries'

/**
 * Seeds the system reference data.
 *
 * Idempotent by construction: it matches on `code` among the system rows, so
 * running it on every deploy is safe and adding an entry to the list is enough
 * to ship it. It never touches an organisation's own entries.
 *
 * Runs as the migrator, because system rows have organization_id NULL and no
 * tenant context could ever satisfy that.
 */
export async function seedSystemData(connectionString: string): Promise<{ inserted: number }> {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    const db = drizzle(client, { schema: { industries } })

    const existing = await db
      .select({ code: industries.code })
      .from(industries)
      .where(isNull(industries.organizationId))

    const known = new Set(existing.map((row) => row.code))
    const missing = INDUSTRY_SEED.filter((entry) => !known.has(entry.code))

    if (missing.length > 0) {
      await db.insert(industries).values(
        missing.map((entry) => ({
          id: uuidv7(),
          organizationId: null,
          code: entry.code,
          labels: entry.labels,
          sortOrder: entry.sortOrder,
        })),
      )
    }

    // Labels can change without the code changing — a wording fix should reach
    // existing installations too.
    for (const entry of INDUSTRY_SEED) {
      await db
        .update(industries)
        .set({ labels: entry.labels, sortOrder: entry.sortOrder })
        .where(sql`${industries.organizationId} IS NULL AND ${industries.code} = ${entry.code}`)
    }

    return { inserted: missing.length }
  } finally {
    await client.end()
  }
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
