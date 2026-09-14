import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * Sandboxes and prebuilt CI images often ship a Chromium that does not match
 * the version Playwright would download. Point this at that binary instead of
 * fetching another one. Unset everywhere else, so CI behaviour is unchanged.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
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
      DATABASE_URL: 'postgres://doomee:doomee@localhost:5432/doomee',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'eu-west-1',
      S3_BUCKET: 'doomee-local',
      S3_ACCESS_KEY_ID: 'doomee',
      S3_SECRET_ACCESS_KEY: 'doomee-secret',
    },
  },
})
