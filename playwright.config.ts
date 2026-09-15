import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * Sandboxes and prebuilt CI images often ship a Chromium that does not match
 * the version Playwright would download, and Playwright then fails at LAUNCH
 * with "Executable doesn't exist" — 130 tests failing in two milliseconds each,
 * which looks like a catastrophic regression and is in fact a missing binary.
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` still wins when set. Otherwise the pre-installed
 * browser is LOOKED UP rather than assumed: the version suffix
 * (`chromium-1194`) changes whenever the image is rebuilt, so hard-coding one
 * only moves the failure to the next image. Nothing found means nothing
 * overridden, and Playwright uses its own download exactly as it does in CI.
 */
function findPreinstalledChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH
  if (explicit) return explicit

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!root || !existsSync(root)) return undefined

  const candidates = readdirSync(root)
    .filter((entry) => entry.startsWith('chromium-'))
    // Newest build first, so a stale copy left behind is not the one chosen.
    .sort((a, b) => Number(b.split('-')[1] ?? 0) - Number(a.split('-')[1] ?? 0))
    .map((entry) => join(root, entry, 'chrome-linux', 'chrome'))

  return candidates.find((candidate) => existsSync(candidate))
}

const chromiumPath = findPreinstalledChromium()
const launchOverride = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...launchOverride } },
    // Mobile-first is a product constraint, so it is a test constraint too.
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], ...launchOverride } },
  ],
  webServer: {
    // The standalone server is the artefact that ships, so it is the one we test.
    command: 'pnpm start:standalone',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      APP_URL: baseURL,
      // scripts/e2e.ts boots the database and hands these down; they are read
      // from the inherited environment, not pinned here.
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      DATABASE_AUTH_URL: process.env.DATABASE_AUTH_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? '',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
      MAIL_CAPTURE_FILE: process.env.MAIL_CAPTURE_FILE ?? '',
      AUTH_RATE_LIMIT_DISABLED: process.env.AUTH_RATE_LIMIT_DISABLED ?? '',
      ENABLE_DEV_PAGES: process.env.ENABLE_DEV_PAGES ?? '',
      // No bucket in the suite: the filesystem adapter is exercised instead,
      // which is the point of having two real implementations (ADR-021).
      // `||`, not `??`: an empty string is not a directory, and STORAGE_DIR has
      // a real default rather than being optional.
      STORAGE_DIR: process.env.STORAGE_DIR || '.doomee-storage',
    },
  },
})
