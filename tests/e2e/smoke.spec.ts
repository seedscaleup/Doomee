import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

const CASES = [
  { locale: 'fr', messages: fr },
  { locale: 'en', messages: en },
] as const

for (const { locale, messages } of CASES) {
  test.describe(`locale ${locale}`, () => {
    test('renders the home page in the right language', async ({ page }) => {
      await page.goto(`/${locale}`)

      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.home.title)
      await expect(page.getByText(messages.app.tagline)).toBeVisible()
    })

    test('shows the eight steps of the Doomee loop', async ({ page }) => {
      await page.goto(`/${locale}`)

      const steps = page.getByRole('list').first().getByRole('listitem')
      await expect(steps).toHaveCount(8)
      await expect(steps.first()).toContainText(messages.home.loop.objective)
      await expect(steps.last()).toContainText(messages.home.loop.nextAction)
    })

    test('serves a localised not-found page', async ({ page }) => {
      const response = await page.goto(`/${locale}/does-not-exist`)

      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.notFound.title)
    })
  })
}

/**
 * Locale negotiation on a bare root, as specified in docs/architecture.md §7:
 * user preference > cookie > Accept-Language > fr.
 * LOT 1 adds the first two links of that chain.
 */
test.describe('locale negotiation on /', () => {
  test.use({ locale: 'fr-FR' })
  test('sends a French reader to /fr', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/fr$/)
  })
})

test.describe('locale negotiation for an English reader', () => {
  test.use({ locale: 'en-US' })
  test('sends an English reader to /en', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/en$/)
  })
})

test.describe('locale negotiation for an unsupported language', () => {
  test.use({ locale: 'de-DE' })
  test('falls back to the default locale', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/fr$/)
  })
})

test('has no horizontal overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/fr')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
