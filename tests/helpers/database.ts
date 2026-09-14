import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { uuidv7 } from 'uuidv7'
import { runMigrations } from '@/db/migrate'
import { provisionAppRole } from '@/db/provision'
import { closeDatabase, configureDatabase } from '@/db/tenant'

/**
 * Boots a real PostgreSQL 16, applies the real migrations, provisions the real
 * login role, and hands back BOTH connection strings:
 *
 *   adminUrl  the migrator (superuser) — used only to set fixtures up
 *   appUrl    what the application actually connects as, subject to RLS
 *
 * Tests must assert through appUrl. Asserting as the superuser would silently
 * bypass every policy and prove nothing.
 */
export type TestDatabase = {
  container: StartedPostgreSqlContainer
  adminUrl: string
  appUrl: string
  stop: () => Promise<void>
}

const APP_ROLE = 'doomee_app'
const APP_PASSWORD = 'test-password-doomee'

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('doomee')
    .withUsername('doomee')
    .withPassword('doomee')
    .start()

  const adminUrl = container.getConnectionUri()
  await runMigrations(adminUrl)
  await provisionAppRole({ adminUrl, loginRole: APP_ROLE, password: APP_PASSWORD })

  const appUrl = adminUrl
    .replace('doomee:doomee@', `${APP_ROLE}:${APP_PASSWORD}@`)
    .replace(/^postgresql:/, 'postgres:')

  configureDatabase({ connectionString: appUrl })

  return {
    container,
    adminUrl,
    appUrl,
    stop: async () => {
      await closeDatabase()
      await container.stop()
    },
  }
}

export function newId(): string {
  return uuidv7()
}

/** Minimal viable organisation, inserted as the migrator so RLS is not in the way. */
export type SeededOrg = { id: string; slug: string }

export async function seedOrganization(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  name: string,
): Promise<SeededOrg> {
  const id = newId()
  const slug = `${name}-${id}`
  await query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [id, name, slug])
  return { id, slug }
}

export async function seedUser(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  email: string,
): Promise<string> {
  const id = newId()
  await query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [id, email, email])
  return id
}
