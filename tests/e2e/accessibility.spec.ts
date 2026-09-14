import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { linkFrom, waitForMail } from './mailbox'

/**
 * Automated accessibility checks on every screen that exists.
 *
 * axe catches the mechanical failures — missing labels, insufficient contrast,
 * broken landmarks — which is most of what goes wrong and all of what a human
 * stops noticing. It does not replace a keyboard pass, so the auth suite does
 * that separately.
 */
const PASSWORD = 'a-long-enough-password'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

async function scan(page: Page, expectedHeading: string) {
  /**
   * Guard against a vacuous pass. This is not hypothetical: the gallery was
   * gated on NODE_ENV, the suite runs a production build, so the first version
   * of this test scanned a 404 page and passed. Asserting "there is an h1"
   * would not have caught it either — the not-found page has one. Only the
   * exact heading proves we are looking at the page we meant to look at.
   */
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(expectedHeading)
  await expect(page.locator('#__next_error__')).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  // Report the rule and the element, not just a count: a bare number sends the
  // next reader to the HTML report instead of to the fix.
  const summary = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.nodes[0]?.target.join(' ')}`,
  )
  expect(summary, 'accessibility violations').toEqual([])
}

const PUBLIC_PAGES = [
  { path: '/fr', heading: fr.home.title },
  { path: '/en', heading: en.home.title },
  { path: '/fr/sign-in', heading: fr.auth.signIn.title },
  { path: '/en/sign-in', heading: en.auth.signIn.title },
  { path: '/fr/sign-up', heading: fr.auth.signUp.title },
  { path: '/fr/forgot-password', heading: fr.auth.forgot.title },
] as const

for (const { path, heading } of PUBLIC_PAGES) {
  test(`${path} has no accessibility violation`, async ({ page }) => {
    await page.goto(path)
    await scan(page, heading)
  })
}

test('the design gallery has no accessibility violation', async ({ page }) => {
  // The whole vocabulary on one page: if a component is inaccessible, it fails
  // here before it ever reaches a product screen.
  await page.goto('/fr/design')
  await scan(page, fr.devDesign.title)
})

test.describe('signed-in screens', () => {
  test('onboarding, the workspace, team and settings pass', async ({ page }) => {
    const email = uniqueEmail('a11y')

    await page.goto('/fr/sign-up')
    await page.getByLabel(fr.auth.signUp.name).fill('Awa Traoré')
    await page.getByLabel(fr.auth.signUp.email).fill(email)
    await page.getByLabel(fr.auth.signUp.password, { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: fr.auth.signUp.submit }).click()
    await page.goto(linkFrom(await waitForMail(email)))

    await page.goto('/fr/sign-in')
    await page.getByLabel(fr.auth.signIn.email).fill(email)
    await page.getByLabel(fr.auth.signIn.password).fill(PASSWORD)
    await page.getByRole('button', { name: fr.auth.signIn.submit }).click()

    await page.goto('/fr/onboarding')
    await scan(page, fr.onboarding.title)

    await page.getByLabel(fr.onboarding.name).fill('Agence Accessible')
    await page.getByRole('button', { name: fr.onboarding.submit }).click()
    await expect(page).toHaveURL(/\/fr\/app$/)
    await scan(page, fr.nav.home)

    await page.goto('/fr/app/team')
    await scan(page, fr.settings.members.title)

    await page.goto('/fr/app/settings')
    await scan(page, fr.settings.title)
  })
})
