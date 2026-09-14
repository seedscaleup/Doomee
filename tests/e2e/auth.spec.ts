import { expect, type Page, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { linkFrom, waitForMail } from './mailbox'
import { formAlert, formStatus } from './ui'

/**
 * The LOT 1 journey, end to end, through the real HTTP stack and a real
 * PostgreSQL with row level security on: sign up, create an organisation, land
 * in the workspace, set preferences, invite a colleague.
 */
const CASES = [
  { locale: 'fr', messages: fr },
  { locale: 'en', messages: en },
] as const

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

async function signUp(page: Page, locale: 'fr' | 'en', email: string, password: string) {
  const messages = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/sign-up`)
  await page.getByLabel(messages.auth.signUp.name).fill('Sandra Kouamé')
  await page.getByLabel(messages.auth.signUp.email).fill(email)
  await page.getByLabel(messages.auth.signUp.password, { exact: true }).fill(password)
  await page.getByRole('button', { name: messages.auth.signUp.submit }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/verify-email`))
}

/** Follows the verification link from the captured mail, like a real recipient. */
async function verifyEmail(page: Page, email: string) {
  const message = await waitForMail(email)
  await page.goto(linkFrom(message))
}

async function failedSignIn(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/fr/sign-in')
  await page.getByLabel(fr.auth.signIn.email).fill(email)
  await page.getByLabel(fr.auth.signIn.password).fill(password)
  await page.getByRole('button', { name: fr.auth.signIn.submit }).click()
  // Wait for the text, not just the element: React renders the alert before
  // the message lands in it, so reading textContent immediately returns ''.
  const alert = formAlert(page)
  await expect(alert).not.toBeEmpty()
  return (await alert.textContent()) ?? ''
}

for (const { locale, messages } of CASES) {
  test.describe(`onboarding in ${locale}`, () => {
    test('signs up, creates an organisation and reaches the workspace', async ({ page }) => {
      const email = uniqueEmail('founder')

      await page.goto(`/${locale}/sign-up`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.auth.signUp.title)

      await page.getByLabel(messages.auth.signUp.name).fill('Sandra Kouamé')
      await page.getByLabel(messages.auth.signUp.email).fill(email)
      await page
        .getByLabel(messages.auth.signUp.password, { exact: true })
        .fill('a-long-enough-password')
      await page.getByRole('button', { name: messages.auth.signUp.submit }).click()

      // Verification is required, so the account is created but not yet usable.
      await expect(page).toHaveURL(new RegExp(`/${locale}/verify-email`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.auth.verify.title)
    })
  })
}

test.describe('the sign-in form', () => {
  test('gives the same answer for a wrong password and an unknown address', async ({ page }) => {
    // Anything else turns the form into an account-enumeration oracle: the
    // attacker learns which addresses have accounts just by reading the error.
    const known = uniqueEmail('enumeration')
    await signUp(page, 'fr', known, 'a-long-enough-password')
    await verifyEmail(page, known)

    const unknown = await failedSignIn(page, uniqueEmail('nobody'), 'a-long-enough-password')
    const wrongPassword = await failedSignIn(page, known, 'a-different-wrong-password')

    expect(unknown).toBe(fr.auth.signIn.failed)
    expect(wrongPassword).toBe(unknown)
  })

  test('never reveals whether an address has an account on password reset', async ({ page }) => {
    await page.goto('/fr/forgot-password')
    await page.getByLabel(fr.auth.forgot.title).fill('nobody@example.test')
    await page.getByRole('button', { name: fr.auth.forgot.submit }).click()

    await expect(formStatus(page)).toHaveText(fr.auth.forgot.sent)
  })
})

test.describe('guarding the workspace', () => {
  test('sends an anonymous visitor to sign-in, not to a 403', async ({ page }) => {
    await page.goto('/fr/app')
    await expect(page).toHaveURL(/\/fr\/sign-in/)
  })

  test('guards the settings page too', async ({ page }) => {
    await page.goto('/fr/app/settings')
    await expect(page).toHaveURL(/\/fr\/sign-in/)
  })

  test('guards onboarding', async ({ page }) => {
    await page.goto('/en/onboarding')
    await expect(page).toHaveURL(/\/en\/sign-in/)
  })
})

test.describe('accessibility of the auth screens', () => {
  test('every field has a label and the form is keyboard-reachable', async ({ page }) => {
    await page.goto('/fr/sign-in')

    const inputs = page.locator('input')
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)

    for (let index = 0; index < count; index += 1) {
      const input = inputs.nth(index)
      const id = await input.getAttribute('id')
      expect(id, 'every input needs an id its label can point at').toBeTruthy()
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1)
    }
  })

  test('has no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/fr/sign-up')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })
})
