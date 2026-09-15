import { type Browser, expect, type Page } from '@playwright/test'
import fr from '../../../messages/fr.json'
import { linkFrom, waitForMail } from '../mailbox'
import { enterWorkspace, signUpAndSignIn, uniqueEmail } from './workspace'

/**
 * Builds the world the portal needs, from both sides.
 *
 * The portal cannot be tested from one browser: it exists precisely because
 * two different people see two different things. So this returns BOTH
 * contexts — the agency that shares, and the client who receives — and every
 * portal test drives them against each other.
 */
export type PortalWorld = {
  agencyPage: Page
  clientPage: Page
  organisation: string
  clientName: string
  contactEmail: string
  close: () => Promise<void>
}

export async function buildPortalWorld(
  browser: Browser,
  prefix: string,
  options: { clientName?: string } = {},
): Promise<PortalWorld> {
  const clientName = options.clientName ?? `Client ${prefix}`

  const agency = await browser.newContext()
  const agencyPage = await agency.newPage()
  const { email: _agencyEmail } = await enterWorkspace(agencyPage, 'fr', prefix)
  const organisation = `Agence ${prefix}`

  // A client account, and a contact on it.
  await agencyPage.goto('/fr/app/clients')
  await agencyPage.getByRole('button', { name: fr.clients.new }).first().click()
  await agencyPage.getByLabel(fr.clients.form.name).fill(clientName)
  await agencyPage.getByRole('button', { name: fr.common.save }).click()
  await agencyPage.getByRole('button', { name: clientName }).click()

  const contactEmail = uniqueEmail(`${prefix}-contact`)
  await agencyPage.getByRole('tab', { name: fr.clients.tabs.contacts }).click()
  await agencyPage.getByRole('button', { name: fr.clients.contacts.add }).click()
  const sheet = agencyPage.getByRole('dialog', { name: fr.clients.contacts.add })
  await sheet.getByLabel(fr.clients.contacts.name).fill('Awa Traoré')
  await sheet.getByLabel(fr.clients.contacts.email).fill(contactEmail)
  await sheet.getByRole('button', { name: fr.common.save }).click()
  await expect(sheet).toBeHidden()

  await agencyPage.getByRole('button', { name: fr.clients.contacts.invite }).click()
  await expect(agencyPage.getByRole('main')).toContainText(contactEmail)

  const invitationUrl = linkFrom(
    await waitForMail(contactEmail, {
      subject: fr.emails.portalInvitation.subject.replace('{organization}', organisation),
    }),
  )

  const client = await browser.newContext()
  const clientPage = await client.newPage()
  await signUpAndSignIn(clientPage, 'fr', contactEmail, 'Awa Traoré')
  await clientPage.goto(invitationUrl)
  await clientPage.getByRole('button', { name: fr.invitation.accept }).click()

  // Accepting lands them IN the portal: "you now have access" and having it
  // are not the same thing.
  await expect(clientPage).toHaveURL(/\/fr\/portal$/)

  return {
    agencyPage,
    clientPage,
    organisation,
    clientName,
    contactEmail,
    close: async () => {
      await agency.close()
      await client.close()
    },
  }
}

/**
 * Creates a project on the agency side and shares it with the client.
 *
 * Sharing is a deliberate act everywhere in Doomee (rule 2), so it is a
 * deliberate step here too rather than a default the helper hides.
 */
export async function shareProject(
  agencyPage: Page,
  name: string,
  clientName: string,
): Promise<void> {
  await agencyPage.goto('/fr/app/projects')
  await agencyPage.getByRole('button', { name: fr.projects.new }).first().click()
  const sheet = agencyPage.getByRole('dialog', { name: fr.projects.form.createTitle })
  await sheet.getByLabel(fr.projects.form.name).fill(name)
  // `exact`, because "Client" is also a prefix of "Visible par le client" and
  // a loose match resolves to two elements.
  await sheet.getByLabel(fr.projects.form.client, { exact: true }).selectOption({
    label: clientName,
  })
  await sheet.getByLabel(fr.projects.form.isClientVisible).check()
  await sheet.getByRole('button', { name: fr.common.save }).click()
  await expect(sheet).toBeHidden()
  await expect(agencyPage.getByRole('main')).toContainText(name)
}

/** Creates a deliverable, gives it a version, and sends it to the client. */
export async function sendDeliverable(
  agencyPage: Page,
  title: string,
  projectName: string,
): Promise<void> {
  await agencyPage.goto('/fr/app/deliverables')
  await agencyPage.getByRole('button', { name: fr.deliverables.new }).first().click()
  const sheet = agencyPage.getByRole('dialog', { name: fr.deliverables.form.createTitle })
  await sheet.getByLabel(fr.deliverables.form.name).fill(title)
  await sheet
    .getByLabel(fr.deliverables.form.project, { exact: true })
    .selectOption({ label: projectName })
  await sheet.getByRole('button', { name: fr.common.save }).click()
  await expect(sheet).toBeHidden()

  await agencyPage.getByRole('button', { name: title }).click()
  await expect(agencyPage.getByRole('heading', { level: 1 })).toHaveText(title)

  await agencyPage.getByRole('button', { name: fr.deliverables.flow.production }).click()
  await agencyPage.getByRole('button', { name: fr.deliverables.flow.internal_review }).click()

  await agencyPage.getByRole('tab', { name: fr.deliverables.tabs.versions }).click()
  await agencyPage.getByRole('button', { name: fr.deliverables.versions.add }).click()
  const versionSheet = agencyPage.getByRole('dialog', {
    name: fr.deliverables.versions.addTitle,
  })
  await versionSheet.getByLabel(fr.deliverables.versions.link).fill('https://example.test/v1')
  await versionSheet.getByRole('button', { name: fr.common.save }).click()
  await expect(versionSheet).toBeHidden()

  await agencyPage.getByRole('button', { name: fr.deliverables.flow.client_review }).click()
  await expect(agencyPage.getByRole('main')).toContainText(fr.status.deliverable.client_review)
}
