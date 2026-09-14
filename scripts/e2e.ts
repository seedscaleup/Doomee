/**
 * Boots a throwaway PostgreSQL, applies the real migrations and provisions the
 * real roles, then runs Playwright against it.
 *
 * This is a script rather than Playwright's globalSetup because the config is
 * evaluated BEFORE globalSetup runs: anything globalSetup puts in process.env
 * is already too late for webServer.env. Doing the ordering explicitly here
 * removes the guesswork.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { runMigrations } from '../src/db/migrate'
import { provisionAppRole } from '../src/db/provision'

const APP_ROLE = 'doomee_app'
const APP_PASSWORD = 'e2e-password-doomee'

async function main(): Promise<number> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('doomee')
    .withUsername('doomee')
    .withPassword('doomee')
    .start()

  // Mails are captured to a file instead of being sent, so tests can follow a
  // verification or invitation link the way a real recipient would.
  const captureDir = mkdtempSync(join(tmpdir(), 'doomee-mail-'))
  const capturePath = join(captureDir, 'mail.jsonl')
  writeFileSync(capturePath, '', 'utf8')

  try {
    const adminUrl = container.getConnectionUri()
    await runMigrations(adminUrl)
    await provisionAppRole({ adminUrl, loginRole: APP_ROLE, password: APP_PASSWORD })

    const appUrl = adminUrl.replace('doomee:doomee@', `${APP_ROLE}:${APP_PASSWORD}@`)

    const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: appUrl,
        DATABASE_AUTH_URL: adminUrl,
        AUTH_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
        MAIL_CAPTURE_FILE: capturePath,
        // The suite creates dozens of accounts from one address in seconds,
        // which any honest per-IP limit refuses. The limits themselves are
        // asserted by tests/unit/auth-rate-limit.test.ts.
        AUTH_RATE_LIMIT_DISABLED: 'true',
      },
    })

    return result.status ?? 1
  } finally {
    rmSync(captureDir, { recursive: true, force: true })
    await container.stop()
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
