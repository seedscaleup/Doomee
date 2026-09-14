import { expect, type Page, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { linkFrom, waitForMail } from './mailbox'
import { formAlert } from './ui'

/**
 * The LOT 1 journey end to end, against a real PostgreSQL with row level
 * security on: create an account, create an organisation, land in the
 * workspace, change preferences, invite a colleague, have them join.
 *
 * Every step goes through the real HTTP stack. Nothing is stubbed, so a broken
 * policy or a missing grant fails here the way it would fail a user.
 */
const PASSWORD = 'a-long-enough-password'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

async function createAccount(page: Page, locale: 'fr' | 'en', email: string) {
  const messages = locale === 'fr' ? fr : en

  await page.goto(`/${locale}/sign-up`)
  await page.getByLabel(messages.auth.signUp.name).fill('Sandra Kouamé')
  await page.getByLabel(messages.auth.signUp.email).fill(email)
  await page.getByLabel(messages.auth.signUp.password, { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: messages.auth.signUp.submit }).click()

  // Surface the form error if there is one: a bare URL assertion would hide
  // why sign-up refused and send the next reader hunting.
  const alert = formAlert(page)
  if (await alert.isVisible().catch(() => false)) {
    throw new Error(`Sign-up refused for ${email}: ${await alert.textContent()}`)
  }
  await expect(page).toHaveURL(new RegExp(`/${locale}/verify-email`))

  // Follow the verification link, exactly as the recipient would.
  await page.goto(linkFrom(await waitForMail(email)))
}

async function signIn(page: Page, locale: 'fr' | 'en', email: string) {
  const messages = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/sign-in`)
  await page.getByLabel(messages.auth.signIn.email).fill(email)
  await page.getByLabel(messages.auth.signIn.password).fill(PASSWORD)
  await page.getByRole('button', { name: messages.auth.signIn.submit }).click()
}

async function createOrganisation(page: Page, locale: 'fr' | 'en', name: string) {
  const messages = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/onboarding`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.onboarding.title)

  await page.getByLabel(messages.onboarding.name).fill(name)
  await page.getByRole('button', { name: messages.onboarding.submit }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/app$`))
}

test.describe('a founder sets up their workspace', () => {
  test('signs up, creates an organisation and reaches the workspace', async ({ page }) => {
    const email = uniqueEmail('founder')
    await createAccount(page, 'fr', email)
    await signIn(page, 'fr', email)
    await createOrganisation(page, 'fr', 'Agence Créative')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.nav.home)
  })

  test('works identically in English', async ({ page }) => {
    const email = uniqueEmail('founder-en')
    await createAccount(page, 'en', email)
    await signIn(page, 'en', email)
    await createOrganisation(page, 'en', 'Creative Agency')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.nav.home)
  })
})

test.describe('preferences', () => {
  test('keeps the report language independent of the interface (ADR-011)', async ({ page }) => {
    const email = uniqueEmail('manager')
    await createAccount(page, 'fr', email)
    await signIn(page, 'fr', email)
    await createOrganisation(page, 'fr', 'Studio Doomee')

    await page.goto('/fr/app/settings')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.settings.title)

    // Work in French, report in English — the explicit requirement of §34.
    await page.getByLabel(fr.settings.profile.reportLocale).selectOption('en')
    await page.getByRole('button', { name: fr.settings.profile.save }).click()
    await expect(page.getByRole('main').getByRole('status')).toHaveText(fr.settings.profile.saved)

    await page.reload()
    await expect(page.getByLabel(fr.settings.profile.locale)).toHaveValue('fr')
    await expect(page.getByLabel(fr.settings.profile.reportLocale)).toHaveValue('en')
  })

  test('switching the interface language moves the URL with it', async ({ page }) => {
    const email = uniqueEmail('switcher')
    await createAccount(page, 'fr', email)
    await signIn(page, 'fr', email)
    await createOrganisation(page, 'fr', 'Bilingue')

    await page.goto('/fr/app/settings')
    await page.getByLabel(fr.settings.profile.locale).selectOption('en')
    await page.getByRole('button', { name: fr.settings.profile.save }).click()

    await expect(page).toHaveURL(/\/en\/app\/settings/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.settings.title)
  })
})

test.describe('inviting a colleague', () => {
  test('sends an invitation the colleague can accept', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const ownerEmail = uniqueEmail('owner')
    const colleagueEmail = uniqueEmail('colleague')

    await createAccount(ownerPage, 'fr', ownerEmail)
    await signIn(ownerPage, 'fr', ownerEmail)
    await createOrganisation(ownerPage, 'fr', 'Équipe Doomee')

    await ownerPage.goto('/fr/app/team')
    await ownerPage.getByLabel(fr.settings.members.email).fill(colleagueEmail)
    await ownerPage.getByLabel(fr.settings.members.role).selectOption('manager')
    await ownerPage.getByRole('button', { name: fr.settings.members.invite }).click()

    await expect(ownerPage.getByRole('main').getByRole('status')).toContainText(colleagueEmail)
    await expect(ownerPage.getByText(fr.settings.members.pending)).toBeVisible()

    // A second person, in their own browser context, with their own account.
    const colleagueContext = await browser.newContext()
    const colleaguePage = await colleagueContext.newPage()
    const invitation = await waitForMail(colleagueEmail)

    await createAccount(colleaguePage, 'fr', colleagueEmail)
    await signIn(colleaguePage, 'fr', colleagueEmail)
    await colleaguePage.goto(linkFrom(invitation))
    await colleaguePage.getByRole('button', { name: fr.invitation.accept }).click()

    await expect(colleaguePage).toHaveURL(/\/fr\/app$/)

    // And the owner now sees them as a member, not as a pending invitation.
    await ownerPage.goto('/fr/app/team')
    await expect(ownerPage.getByText(colleagueEmail)).toBeVisible()

    await ownerContext.close()
    await colleagueContext.close()
  })

  test('refuses an invitation token that does not exist', async ({ page }) => {
    const email = uniqueEmail('curious')
    await createAccount(page, 'fr', email)
    await signIn(page, 'fr', email)
    await createOrganisation(page, 'fr', 'Curieux')

    await page.goto('/fr/invitation/an-invented-token-that-is-long-enough-to-pass')
    await page.getByRole('button', { name: fr.invitation.accept }).click()

    await expect(formAlert(page)).toHaveText(fr.invitation.invalid)
  })
})
