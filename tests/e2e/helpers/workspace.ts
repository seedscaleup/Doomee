import { expect, type Page } from '@playwright/test'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import { linkFrom, waitForMail } from '../mailbox'

/**
 * Gets a browser into a signed-in workspace.
 *
 * Every product suite needs this, and each one writing its own version is how
 * they drift apart — and how a change to sign-up breaks five files instead of
 * one.
 */
export const PASSWORD = 'a-long-enough-password'

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

export async function signUpAndSignIn(
  page: Page,
  locale: 'fr' | 'en',
  email: string,
  name = 'Sandra Kouamé',
): Promise<void> {
  const messages = locale === 'fr' ? fr : en

  await page.goto(`/${locale}/sign-up`)
  await page.getByLabel(messages.auth.signUp.name).fill(name)
  await page.getByLabel(messages.auth.signUp.email).fill(email)
  await page.getByLabel(messages.auth.signUp.password, { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: messages.auth.signUp.submit }).click()

  // Follow the verification link, exactly as the recipient would — named by
  // subject, because this address may already hold an invitation.
  await page.goto(linkFrom(await waitForMail(email, { subject: messages.emails.verify.subject })))

  await page.goto(`/${locale}/sign-in`)
  await page.getByLabel(messages.auth.signIn.email).fill(email)
  await page.getByLabel(messages.auth.signIn.password).fill(PASSWORD)
  await page.getByRole('button', { name: messages.auth.signIn.submit }).click()

  // Wait for the session cookie to actually be set. Navigating away while the
  // sign-in request is still in flight leaves the next page anonymous, which
  // then redirects back here — a failure that reads like a broken page rather
  // than the race it is.
  await expect(page).not.toHaveURL(/\/sign-in/)
}

export async function createOrganisation(
  page: Page,
  locale: 'fr' | 'en',
  name: string,
): Promise<void> {
  const messages = locale === 'fr' ? fr : en

  await page.goto(`/${locale}/onboarding`)
  await page.getByLabel(messages.onboarding.name).fill(name)
  await page.getByRole('button', { name: messages.onboarding.submit }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/app$`))
}

/** Sign up, verify, sign in and land in a fresh organisation. */
export async function enterWorkspace(
  page: Page,
  locale: 'fr' | 'en',
  prefix: string,
): Promise<{ email: string }> {
  const email = uniqueEmail(prefix)
  await signUpAndSignIn(page, locale, email)
  await createOrganisation(page, locale, `Agence ${prefix}`)
  return { email }
}
