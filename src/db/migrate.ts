import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { poolConfig } from './client'

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations')

/**
 * Plain SQL migration runner — no provider-specific tooling (ADR-021).
 * drizzle-kit generates the files; they are reviewed by hand, and RLS policies
 * are appended manually (CLAUDE.md §7).
 */
export async function runMigrations(connectionString: string): Promise<string[]> {
  const client = new Client(poolConfig(connectionString))
  await client.connect()
  const applied: string[] = []

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `)

    const entries = await readdir(MIGRATIONS_DIR).catch(() => [])
    const files = entries.filter((name) => name.endsWith('.sql')).sort()

    for (const filename of files) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename],
      )
      if (rowCount) continue

      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
        await client.query('COMMIT')
        applied.push(filename)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }

  return applied
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to run migrations')

  runMigrations(url).then(
    (applied) => {
      console.warn(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations')
    },
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
