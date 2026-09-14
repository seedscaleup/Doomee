import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace, signUpAndSignIn, uniqueEmail } from './helpers/workspace'
import { linkFrom, waitForMail } from './mailbox'
import { formAlert } from './ui'

/**
 * Surfaces a form error instead of letting the next assertion time out on a
 * missing row. A bare "element not found" sends the reader hunting; the message
 * the user would have seen says what actually went wrong.
 */
async function expectSaved(page: import('@playwright/test').Page) {
  const alert = formAlert(page)
  if (await alert.isVisible().catch(() => false)) {
    throw new Error(`The form refused to save: ${await alert.textContent()}`)
  }
}

/**
 * The client domain, end to end, against a real PostgreSQL with row level
 * security on: create, find, edit, add a contact, read the history, archive.
 */
test.describe('managing clients', () => {
  test('creates a client and finds it in the list', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'clients')

    await page.goto('/fr/app/clients')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.clients.title)

    // Nothing yet: the empty state invites the first one rather than showing a
    // blank table.
    await expect(page.getByText(fr.clients.emptyTitle)).toBeVisible()

    await page.getByRole('button', { name: fr.clients.new }).first().click()
    await page.getByLabel(fr.clients.form.name).fill('Côte Ouest Distribution')
    await page.getByLabel(fr.clients.form.email).fill('contact@cote-ouest.test')
    await page.getByRole('button', { name: fr.common.save }).click()

    await expectSaved(page)
    await expect(page.getByRole('main')).toContainText('Côte Ouest Distribution')
  })

  test('finds an accented name from an unaccented search', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'search')
    await page.goto('/fr/app/clients')

    await page.getByRole('button', { name: fr.clients.new }).first().click()
    await page.getByLabel(fr.clients.form.name).fill('Élégance Côte d’Ivoire')
    await page.getByRole('button', { name: fr.common.save }).click()
    await expect(page.getByRole('main')).toContainText('Élégance Côte d’Ivoire')

    // In French, a search that demands the right accent is a search that fails.
    await page.getByLabel(fr.clients.searchPlaceholder).fill('elegance cote')
    await expect(page.getByRole('main')).toContainText('Élégance Côte d’Ivoire')

    await page.getByLabel(fr.clients.searchPlaceholder).fill('introuvable')
    await expect(page.getByText(fr.clients.noResultsTitle)).toBeVisible()
  })

  test('opens a client, adds a contact and sees the history', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'detail')
    await page.goto('/fr/app/clients')

    await page.getByRole('button', { name: fr.clients.new }).first().click()
    await page.getByLabel(fr.clients.form.name).fill('MTA Group')
    await page.getByRole('button', { name: fr.common.save }).click()

    await page.getByRole('button', { name: 'MTA Group' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MTA Group')

    await page.getByRole('tab', { name: fr.clients.tabs.contacts }).click()
    await page.getByRole('button', { name: fr.clients.contacts.add }).click()

    // The edit sheet for the client is in the same page, closed. Scoping to the
    // dialog that is actually open keeps "Nom" from matching "Nom du client".
    const contactSheet = page.getByRole('dialog', { name: fr.clients.contacts.add })
    await contactSheet.getByLabel(fr.clients.contacts.name).fill('Awa Traoré')
    await contactSheet.getByLabel(fr.clients.contacts.email).fill('awa@mta.test')
    await contactSheet.getByRole('button', { name: fr.common.save }).click()

    await expect(page.getByText('awa@mta.test')).toBeVisible()
    // Recording who to talk to is not the same as granting product access.
    await expect(page.getByText(fr.clients.contacts.noPortalAccess)).toBeVisible()

    await page.getByRole('tab', { name: fr.clients.tabs.activity }).click()
    await expect(page.getByText(/MTA Group/).first()).toBeVisible()
  })

  test('archives a client after confirmation', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'archive')
    await page.goto('/fr/app/clients')

    await page.getByRole('button', { name: fr.clients.new }).first().click()
    await page.getByLabel(fr.clients.form.name).fill('Ancien Client')
    await page.getByRole('button', { name: fr.common.save }).click()

    await page.getByRole('button', { name: 'Ancien Client' }).click()
    await page.getByRole('button', { name: fr.clients.archive.action }).click()

    // Opening and confirming both read "Archiver"; only one of them is in the
    // confirmation dialog, and that is the one that must be pressed.
    const confirm = page.getByRole('dialog', { name: fr.clients.archive.title })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: fr.clients.archive.confirm }).click()

    await expect(page.getByRole('main')).toContainText(fr.status.client.archived)
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'english')
    await page.goto('/en/app/clients')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.clients.title)
    await page.getByRole('button', { name: en.clients.new }).first().click()
    await page.getByLabel(en.clients.form.name).fill('Westbound Retail')
    await page.getByRole('button', { name: en.common.save }).click()

    await expect(page.getByRole('main')).toContainText('Westbound Retail')
  })
})

test.describe('the client boundary', () => {
  test('one organisation never sees another organisation clients', async ({ browser }) => {
    // The commercial failure mode of a multi-tenant product, checked through
    // the real HTTP stack rather than only at the database level.
    const first = await browser.newContext()
    const firstPage = await first.newPage()
    await enterWorkspace(firstPage, 'fr', 'tenant-a')
    await firstPage.goto('/fr/app/clients')
    await firstPage.getByRole('button', { name: fr.clients.new }).first().click()
    await firstPage.getByLabel(fr.clients.form.name).fill('Secret Client A')
    await firstPage.getByRole('button', { name: fr.common.save }).click()
    await expect(firstPage.getByRole('main')).toContainText('Secret Client A')

    await firstPage.getByRole('button', { name: 'Secret Client A' }).click()
    await expect(firstPage.getByRole('heading', { level: 1 })).toHaveText('Secret Client A')
    const clientUrl = firstPage.url()

    const second = await browser.newContext()
    const secondPage = await second.newPage()
    await enterWorkspace(secondPage, 'fr', 'tenant-b')

    await secondPage.goto('/fr/app/clients')
    await expect(secondPage.getByRole('main')).not.toContainText('Secret Client A')

    // And the direct URL is a 404, not a 403: confirming the row exists would
    // itself be a disclosure.
    const response = await secondPage.goto(clientUrl)
    expect(response?.status()).toBe(404)

    await first.close()
    await second.close()
  })

  test('refuses a client id that does not exist', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'missing')
    const response = await page.goto('/fr/app/clients/00000000-0000-0000-0000-000000000000')
    expect(response?.status()).toBe(404)
  })
})

/**
 * A client contact reaches the product through the portal, never through the
 * internal workspace. The invitation is what opens ONE client account to them
 * (ADR-023), and this checks both halves: the access is granted, and the
 * internal side stays shut.
 */
test.describe('inviting a client contact to the portal', () => {
  const WORKSPACE = 'portal-invite'
  // enterWorkspace names the organisation after the workspace; the invitation
  // subject carries that name, which is how the right mail is recognised.
  const ORGANISATION = `Agence ${WORKSPACE}`

  test('grants access to one account and keeps the internal app closed', async ({ browser }) => {
    const agency = await browser.newContext()
    const agencyPage = await agency.newPage()
    await enterWorkspace(agencyPage, 'fr', WORKSPACE)

    await agencyPage.goto('/fr/app/clients')
    await agencyPage.getByRole('button', { name: fr.clients.new }).first().click()
    await agencyPage.getByLabel(fr.clients.form.name).fill('Groupe Atlantique')
    await agencyPage.getByRole('button', { name: fr.common.save }).click()
    await agencyPage.getByRole('button', { name: 'Groupe Atlantique' }).click()

    const contactEmail = uniqueEmail('contact')
    await agencyPage.getByRole('tab', { name: fr.clients.tabs.contacts }).click()
    await agencyPage.getByRole('button', { name: fr.clients.contacts.add }).click()
    const sheet = agencyPage.getByRole('dialog', { name: fr.clients.contacts.add })
    await sheet.getByLabel(fr.clients.contacts.name).fill('Awa Traoré')
    await sheet.getByLabel(fr.clients.contacts.email).fill(contactEmail)
    await sheet.getByRole('button', { name: fr.common.save }).click()

    await expect(agencyPage.getByText(fr.clients.contacts.noPortalAccess)).toBeVisible()
    await agencyPage.getByRole('button', { name: fr.clients.contacts.invite }).click()
    await expect(agencyPage.getByRole('main')).toContainText(contactEmail)

    const invitationUrl = linkFrom(
      await waitForMail(contactEmail, {
        subject: fr.emails.portalInvitation.subject.replace('{organization}', ORGANISATION),
      }),
    )

    const contact = await browser.newContext()
    const contactPage = await contact.newPage()
    await signUpAndSignIn(contactPage, 'fr', contactEmail, 'Awa Traoré')

    await contactPage.goto(invitationUrl)
    await contactPage.getByRole('button', { name: fr.invitation.accept }).click()
    await expect(contactPage.getByRole('main')).toContainText(fr.invitation.clientAccepted)

    // The decisive assertion: a client membership is not a way in. 404, not
    // 403 — the internal workspace does not confirm that it exists.
    const response = await contactPage.goto('/fr/app')
    expect(response?.status()).toBe(404)

    // And the agency sees the contact as connected to the portal.
    await agencyPage.reload()
    await agencyPage.getByRole('tab', { name: fr.clients.tabs.contacts }).click()
    await expect(agencyPage.getByText(fr.clients.contacts.portalAccess)).toBeVisible()

    await agency.close()
    await contact.close()
  })
})
