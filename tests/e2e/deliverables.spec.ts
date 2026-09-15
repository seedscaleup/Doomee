import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace } from './helpers/workspace'

type Page = import('@playwright/test').Page

async function createProject(page: Page, name: string, locale: 'fr' | 'en' = 'fr') {
  const m = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/app/projects`)
  await page.getByRole('button', { name: m.projects.new }).first().click()
  await page.getByLabel(m.projects.form.name).fill(name)
  await page.getByRole('button', { name: m.common.save }).click()
  await expect(page.getByRole('main')).toContainText(name)
}

async function createDeliverable(page: Page, title: string, locale: 'fr' | 'en' = 'fr') {
  const m = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/app/deliverables`)
  await page.getByRole('button', { name: m.deliverables.new }).first().click()

  const sheet = page.getByRole('dialog', { name: m.deliverables.form.createTitle })
  await sheet.getByLabel(m.deliverables.form.name).fill(title)
  await sheet.getByRole('button', { name: m.common.save }).click()
  await expect(sheet).toBeHidden()

  await expect(page.getByRole('main')).toContainText(title)
  await page.getByRole('button', { name: title }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
}

async function addVersion(page: Page, url: string, locale: 'fr' | 'en' = 'fr') {
  const m = locale === 'fr' ? fr : en
  await page.getByRole('tab', { name: m.deliverables.tabs.versions }).click()
  await page.getByRole('button', { name: m.deliverables.versions.add }).click()

  const sheet = page.getByRole('dialog', { name: m.deliverables.versions.addTitle })
  await sheet.getByLabel(m.deliverables.versions.link).fill(url)
  await sheet.getByRole('button', { name: m.common.save }).click()
  await expect(sheet).toBeHidden()
}

/**
 * ============================================================================
 * THE VALIDATION CYCLE, END TO END.
 *
 * `LIVRABLE` in the central loop: what the client actually receives, from the
 * first iteration to the moment it is handed over.
 * ============================================================================
 */
test.describe('the deliverable cycle', () => {
  test('goes from draft to the client, one deliberate step at a time', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'deliv')
    await createProject(page, 'Refonte du site')
    await createDeliverable(page, 'Charte graphique')

    const main = page.getByRole('main')
    await expect(main).toContainText(fr.status.deliverable.draft)

    // Nothing to send yet: the step exists but is not offered.
    await page.getByRole('button', { name: fr.deliverables.flow.production }).click()
    await expect(main).toContainText(fr.status.deliverable.production)

    await page.getByRole('button', { name: fr.deliverables.flow.internal_review }).click()
    await expect(main).toContainText(fr.status.deliverable.internal_review)

    // Still nothing to send — the button is offered but refuses, because a
    // deliverable with no version is an empty promise.
    await expect(
      page.getByRole('button', { name: fr.deliverables.flow.client_review }),
    ).toBeDisabled()

    await addVersion(page, 'https://example.test/charte-v1')
    await expect(page.getByRole('main')).toContainText(
      fr.deliverables.currentVersion.replace('{version}', '1'),
    )

    await page.getByRole('button', { name: fr.deliverables.flow.client_review }).click()
    await expect(page.getByRole('main')).toContainText(fr.status.deliverable.client_review)
  })

  /**
   * ==========================================================================
   * THE RULE THE WHOLE LOT EXISTS FOR.
   *
   * Once it is with the client, the internal team has NO button. Not a disabled
   * one — none, plus a sentence saying whose decision it is (ADR-041).
   * ==========================================================================
   */
  test('gives the internal team no way to approve on the client’s behalf', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'deliv-wall')
    await createProject(page, 'Campagne été')
    await createDeliverable(page, 'Visuels de campagne')

    await page.getByRole('button', { name: fr.deliverables.flow.production }).click()
    await page.getByRole('button', { name: fr.deliverables.flow.internal_review }).click()
    await addVersion(page, 'https://example.test/visuels-v1')
    await page.getByRole('button', { name: fr.deliverables.flow.client_review }).click()

    const main = page.getByRole('main')
    await expect(main).toContainText(fr.status.deliverable.client_review)
    await expect(main).toContainText(fr.deliverables.flow.waitingClient)

    // No approve button anywhere on the page — not even a disabled one.
    await expect(page.getByRole('button', { name: fr.deliverables.reviews.approve })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: fr.deliverables.reviews.requestChanges }),
    ).toHaveCount(0)
  })

  /** The manager's verdict, recorded against the exact version. */
  test('records an internal review against the version it is about', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'deliv-review')
    await createProject(page, 'Plaquette')
    await createDeliverable(page, 'Plaquette commerciale')

    await page.getByRole('button', { name: fr.deliverables.flow.production }).click()
    await page.getByRole('button', { name: fr.deliverables.flow.internal_review }).click()
    await addVersion(page, 'https://example.test/plaquette-v1')

    await page.getByRole('tab', { name: fr.deliverables.tabs.reviews }).click()

    // Changes requested with no comment is refused: "make it better" with no
    // detail is the most expensive message in agency work.
    await page.getByRole('button', { name: fr.deliverables.reviews.requestChanges }).click()
    await expect(page.getByRole('main')).toContainText(fr.deliverables.reviews.commentRequired)

    await page.getByLabel(fr.deliverables.reviews.comment).fill('Le logo est trop petit.')
    await page.getByRole('button', { name: fr.deliverables.reviews.requestChanges }).click()

    const main = page.getByRole('main')
    await expect(main).toContainText('Le logo est trop petit.')
    await expect(main).toContainText(fr.deliverables.reviews.onVersion.replace('{version}', '1'))
    // An internal "changes requested" sends it back to production.
    await expect(main).toContainText(fr.status.deliverable.production)
  })

  /** A version must BE something. */
  test('refuses a version that carries neither a file nor a link', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'deliv-empty')
    await createProject(page, 'Projet vide')
    await createDeliverable(page, 'Livrable sans contenu')

    await page.getByRole('tab', { name: fr.deliverables.tabs.versions }).click()
    await page.getByRole('button', { name: fr.deliverables.versions.add }).click()

    const sheet = page.getByRole('dialog', { name: fr.deliverables.versions.addTitle })
    await sheet.getByRole('button', { name: fr.common.save }).click()

    // The sheet stays open: nothing was created.
    await expect(sheet).toBeVisible()
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'deliv-en')
    await createProject(page, 'Website rebuild', 'en')
    await createDeliverable(page, 'Brand guidelines', 'en')

    const main = page.getByRole('main')
    await expect(main).toContainText(en.status.deliverable.draft)

    await page.getByRole('button', { name: en.deliverables.flow.production }).click()
    await expect(main).toContainText(en.status.deliverable.production)

    await addVersion(page, 'https://example.test/brand-v1', 'en')
    await expect(page.getByRole('main')).toContainText(
      en.deliverables.currentVersion.replace('{version}', '1'),
    )
  })

  /** One organisation never reaches another's deliverable, even by URL. */
  test('refuses a deliverable id from another organisation', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'deliv-a')
    await createProject(page, 'Projet A')
    await createDeliverable(page, 'Livrable A')

    await page.getByRole('heading', { level: 1 }).waitFor()
    const url = page.url()
    const id = url.split('/').pop()
    expect(id).toBeTruthy()

    await enterWorkspace(page, 'fr', 'deliv-b')
    const response = await page.goto(`/fr/app/deliverables/${id}`)

    // 404, never 403: confirming it exists elsewhere would be the disclosure.
    expect(response?.status()).toBe(404)
  })
})
