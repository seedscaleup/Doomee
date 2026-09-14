import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '@/db/migrate'

/**
 * D7 — Integration tests run against a real PostgreSQL 16, never a mock.
 * Row level security cannot be tested any other way, and LOT 1 depends
 * entirely on this harness working.
 */
describe('database harness', () => {
  let container: StartedPostgreSqlContainer
  let client: Client

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('doomee')
      .withUsername('doomee')
      .withPassword('doomee')
      .start()

    await runMigrations(container.getConnectionUri())

    client = new Client({ connectionString: container.getConnectionUri() })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
    await container?.stop()
  })

  it('runs on PostgreSQL 16 or newer', async () => {
    const { rows } = await client.query<{ server_version: string }>('SHOW server_version')
    const major = Number.parseInt(rows[0]?.server_version ?? '0', 10)
    expect(major).toBeGreaterThanOrEqual(16)
  })

  it('applies migrations and records them', async () => {
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    )
    expect(rows.map((row) => row.filename)).toEqual([
      '0000_extensions.sql',
      '0001_tenancy.sql',
      '0002_rls_policies.sql',
    ])
  })

  it('is idempotent: re-running applies nothing', async () => {
    const applied = await runMigrations(container.getConnectionUri())
    expect(applied).toEqual([])
  })

  it('has the extensions the schema will rely on', async () => {
    const { rows } = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('citext', 'unaccent', 'pg_trgm')",
    )
    expect(rows.map((row) => row.extname).sort()).toEqual(['citext', 'pg_trgm', 'unaccent'])
  })

  it('supports security_invoker views, required by the portal isolation (ADR-026)', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS probe (id int, secret text)')
    await client.query(
      'CREATE OR REPLACE VIEW probe_public WITH (security_invoker = true) AS SELECT id FROM probe',
    )
    const { rows } = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'probe_public'",
    )
    expect(rows.map((row) => row.column_name)).toEqual(['id'])
  })
})
