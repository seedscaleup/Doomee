import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace, signUpAndSignIn, uniqueEmail } from './helpers/workspace'
import { linkFrom, waitForMail } from './mailbox'

/**
 * Projects, end to end, on a real database with row level security on.
 */
test.describe('managing projects', () => {
  test('creates a project and finds it in the list', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'projects')
    await page.goto('/fr/app/projects')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.projects.title)
    await expect(page.getByText(fr.projects.emptyTitle)).toBeVisible()

    await page.getByRole('button', { name: fr.projects.new }).first().click()
    await page.getByLabel(fr.projects.form.name).fill('Refonte du site')
    await page.getByRole('button', { name: fr.common.save }).click()

    await expect(page.getByRole('main')).toContainText('Refonte du site')
  })

  test('refuses a status jump the machine does not allow', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'transitions')
    await page.goto('/fr/app/projects')

    await page.getByRole('button', { name: fr.projects.new }).first().click()
    await page.getByLabel(fr.projects.form.name).fill('Campagne Été')
    await page.getByRole('button', { name: fr.common.save }).click()
    await page.getByRole('button', { name: 'Campagne Été' }).click()

    // The edit sheet offers only the moves the machine accepts from here, so a
    // project that has not started cannot be marked done in one go.
    await page.getByRole('button', { name: fr.common.save }).first().click()
    const sheet = page.getByRole('dialog', { name: fr.projects.form.editTitle })
    const options = await sheet
      .getByLabel(fr.projects.form.status)
      .locator('option')
      .allInnerTexts()

    expect(options).toContain(fr.status.project.to_start)
    expect(options).toContain(fr.status.project.in_progress)
    expect(options).not.toContain(fr.status.project.done)
  })

  test('tracks progress from milestones until there are actions', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'milestones')
    await page.goto('/fr/app/projects')

    await page.getByRole('button', { name: fr.projects.new }).first().click()
    await page.getByLabel(fr.projects.form.name).fill('Lancement produit')
    await page.getByRole('button', { name: fr.common.save }).click()
    await page.getByRole('button', { name: 'Lancement produit' }).click()

    await page.getByRole('tab', { name: fr.projects.tabs.milestones }).click()
    for (const title of ['Maquettes validées', 'Mise en ligne']) {
      await page.getByRole('button', { name: fr.projects.milestones.add }).click()
      const sheet = page.getByRole('dialog', { name: fr.projects.milestones.add })
      await sheet.getByLabel(fr.projects.milestones.titleField).fill(title)
      await sheet.getByRole('button', { name: fr.common.save }).click()
      await expect(page.getByRole('main')).toContainText(title)
    }

    // Nothing reached yet: the ring reads 0.
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    await page.getByRole('button', { name: fr.projects.milestones.markReached }).first().click()
    await expect(page.getByText(fr.status.milestone.reached)).toBeVisible()

    // One of two reached — and the denormalised column was rewritten in the
    // same transaction, so the header agrees without a nightly job.
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  test('never scrolls sideways, whatever the viewport', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'width')
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: fr.projects.new }).first().click()
    await page.getByLabel(fr.projects.form.name).fill('Projet large')
    await page.getByRole('button', { name: fr.common.save }).click()
    await page.getByRole('button', { name: 'Projet large' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projet large')

    /**
     * The detail screen has five tabs, and five tabs do not fit in 393 CSS
     * pixels. A row that does not scroll on its own widens the PAGE instead —
     * which moves every tap target on the screen, not just the tabs. Measured
     * at 83px the day the fifth tab arrived.
     */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the project screen must not scroll sideways').toBeLessThanOrEqual(0)

    // The tab row itself is allowed to scroll: that is where the width goes.
    const tablist = page.getByRole('tablist')
    await expect(tablist).toBeVisible()
    for (const name of ['overview', 'objectives', 'members', 'milestones', 'activity'] as const) {
      await expect(tablist.getByRole('tab', { name: fr.projects.tabs[name] })).toBeVisible()
    }
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'projects-en')
    await page.goto('/en/app/projects')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.projects.title)
    await page.getByRole('button', { name: en.projects.new }).first().click()
    await page.getByLabel(en.projects.form.name).fill('Website rebuild')
    await page.getByRole('button', { name: en.common.save }).click()

    await expect(page.getByRole('main')).toContainText('Website rebuild')
  })
})

/**
 * ============================================================================
 * THE COLLABORATOR SCOPE — the second security barrier, checked through the
 * real HTTP stack.
 *
 * `project_members` is what decides which projects a collaborator reads. Not a
 * filter the list applies for tidiness: a project they are not on must be
 * absent from the list AND answer 404 at its own URL.
 * ============================================================================
 */
test.describe('what a collaborator can see', () => {
  test('sees only the projects they are a member of', async ({ browser }) => {
    const WORKSPACE = 'scope'
    const ORGANISATION = `Agence ${WORKSPACE}`

    const managerContext = await browser.newContext()
    const manager = await managerContext.newPage()
    await enterWorkspace(manager, 'fr', WORKSPACE)

    await manager.goto('/fr/app/projects')
    for (const name of ['Projet partagé', 'Projet réservé']) {
      await manager.getByRole('button', { name: fr.projects.new }).first().click()
      await manager.getByLabel(fr.projects.form.name).fill(name)
      await manager.getByRole('button', { name: fr.common.save }).click()
      await expect(manager.getByRole('main')).toContainText(name)
    }

    // Invite a collaborator into the organisation…
    const collaboratorEmail = uniqueEmail('collab')
    await manager.goto('/fr/app/team')
    await manager.getByLabel(fr.settings.members.email).fill(collaboratorEmail)
    await manager.getByLabel(fr.settings.members.role).selectOption('collaborator')
    await manager.getByRole('button', { name: fr.settings.members.invite }).click()
    await expect(manager.getByRole('main').getByRole('status')).toContainText(collaboratorEmail)

    const invitationUrl = linkFrom(
      await waitForMail(collaboratorEmail, {
        subject: fr.emails.invitation.subject.replace('{organization}', ORGANISATION),
      }),
    )

    const collaboratorContext = await browser.newContext()
    const collaborator = await collaboratorContext.newPage()
    await signUpAndSignIn(collaborator, 'fr', collaboratorEmail, 'Koffi Yao')
    await collaborator.goto(invitationUrl)
    await collaborator.getByRole('button', { name: fr.invitation.accept }).click()
    await expect(collaborator).toHaveURL(/\/fr\/app$/)

    // …and put them on ONE of the two projects.
    await manager.goto('/fr/app/projects')
    await manager.getByRole('button', { name: 'Projet partagé' }).click()
    // Wait for the navigation to land before reading the URL: page.url() is
    // synchronous, so reading it straight after a click yields the LIST url and
    // quietly turns the assertions below into nothing.
    await expect(manager.getByRole('heading', { level: 1 })).toHaveText('Projet partagé')
    const sharedUrl = manager.url()
    expect(sharedUrl).toMatch(/\/app\/projects\/[0-9a-f-]{36}$/)

    await manager.getByRole('tab', { name: fr.projects.tabs.members }).click()
    await manager.getByRole('button', { name: fr.projects.members.add }).click()
    const sheet = manager.getByRole('dialog', { name: fr.projects.members.add })
    await sheet.getByLabel(fr.projects.members.person).selectOption({ label: 'Koffi Yao' })
    await sheet.getByRole('button', { name: fr.common.save }).click()
    await expect(manager.getByRole('main')).toContainText('Koffi Yao')

    await manager.goto('/fr/app/projects')
    await manager.getByRole('button', { name: 'Projet réservé' }).click()
    await expect(manager.getByRole('heading', { level: 1 })).toHaveText('Projet réservé')
    const reservedUrl = manager.url()
    expect(reservedUrl).not.toBe(sharedUrl)

    // The list shows one project, not two.
    await collaborator.goto('/fr/app/projects')
    await expect(collaborator.getByRole('main')).toContainText('Projet partagé')
    await expect(collaborator.getByRole('main')).not.toContainText('Projet réservé')

    // And the direct URL of the other one is a 404, not a 403: confirming it
    // exists would itself be a disclosure.
    await expect(collaborator.goto(sharedUrl).then((r) => r?.status())).resolves.toBe(200)
    await expect(collaborator.goto(reservedUrl).then((r) => r?.status())).resolves.toBe(404)

    await managerContext.close()
    await collaboratorContext.close()
  })
})
