import { expect, test } from '@playwright/test'
import fr from '../../messages/fr.json'
import { buildPortalWorld, sendDeliverable, shareProject } from './helpers/portal'
import { enterWorkspace } from './helpers/workspace'

/**
 * ============================================================================
 * THE CLIENT PORTAL, END TO END.
 *
 * Every test here drives TWO browsers, because the portal exists precisely so
 * that two people see two different things. Asserting from one side only would
 * prove half of it.
 * ============================================================================
 */
test.describe('the client portal', () => {
  test('shows a client what was shared, and nothing that was not', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'portal')

    await shareProject(world.agencyPage, 'Refonte du site', world.clientName)
    // A second project, deliberately NOT shared.
    await world.agencyPage.goto('/fr/app/projects')
    await world.agencyPage.getByRole('button', { name: fr.projects.new }).first().click()
    const sheet = world.agencyPage.getByRole('dialog', { name: fr.projects.form.createTitle })
    await sheet.getByLabel(fr.projects.form.name).fill('Chantier interne')
    await sheet.getByRole('button', { name: fr.common.save }).click()
    await expect(sheet).toBeHidden()

    await world.clientPage.goto('/fr/portal/projects')
    const main = world.clientPage.getByRole('main')

    await expect(main).toContainText('Refonte du site')
    // The whole promise of rule 2, in one assertion.
    await expect(main).not.toContainText('Chantier interne')

    await world.close()
  })

  /**
   * ==========================================================================
   * THE VALIDATION CYCLE, FROM THE CLIENT'S SIDE.
   *
   * This is the half LOT 8 deliberately could not do: the only buttons that
   * approve a deliverable live here, in the portal, and nowhere else.
   * ==========================================================================
   */
  test('lets the client approve a deliverable, and the agency sees it', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'approve')

    await shareProject(world.agencyPage, 'Identité visuelle', world.clientName)
    await sendDeliverable(world.agencyPage, 'Charte graphique', 'Identité visuelle')

    // The client is told, on the first screen, that something awaits them.
    await world.clientPage.goto('/fr/portal')
    await expect(world.clientPage.getByRole('main')).toContainText(fr.portal.overview.awaiting)

    await world.clientPage.goto('/fr/portal/deliverables')
    await world.clientPage.getByRole('link', { name: /Charte graphique/ }).click()
    await expect(world.clientPage.getByRole('heading', { level: 1 })).toHaveText('Charte graphique')

    await world.clientPage.getByRole('button', { name: fr.portal.deliverables.approve }).click()
    await expect(world.clientPage.getByRole('main')).toContainText(fr.status.deliverable.approved)

    // And the agency sees the decision, on the version it was about.
    await world.agencyPage.reload()
    await expect(world.agencyPage.getByRole('main')).toContainText(fr.status.deliverable.approved)
    await world.agencyPage.getByRole('tab', { name: fr.deliverables.tabs.reviews }).click()
    await expect(world.agencyPage.getByRole('main')).toContainText(fr.deliverables.reviews.client)

    await world.close()
  })

  test('refuses a change request with no explanation', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'changes')

    await shareProject(world.agencyPage, 'Campagne', world.clientName)
    await sendDeliverable(world.agencyPage, 'Visuels', 'Campagne')

    await world.clientPage.goto('/fr/portal/deliverables')
    await world.clientPage.getByRole('link', { name: /Visuels/ }).click()

    await world.clientPage
      .getByRole('button', { name: fr.portal.deliverables.requestChanges })
      .click()
    await expect(world.clientPage.getByRole('main')).toContainText(
      fr.portal.deliverables.commentRequired,
    )

    await world.clientPage
      .getByLabel(fr.portal.deliverables.comment)
      .fill('Le bleu est trop foncé.')
    await world.clientPage
      .getByRole('button', { name: fr.portal.deliverables.requestChanges })
      .click()

    await expect(world.clientPage.getByRole('main')).toContainText(
      fr.status.deliverable.changes_requested,
    )

    // The agency receives the reason, attached to the version.
    await world.agencyPage.reload()
    await world.agencyPage.getByRole('tab', { name: fr.deliverables.tabs.reviews }).click()
    await expect(world.agencyPage.getByRole('main')).toContainText('Le bleu est trop foncé.')

    await world.close()
  })

  /** A client's message reaches the team, and is shared by construction. */
  test('carries a client message to the agency', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'message')

    await shareProject(world.agencyPage, 'Projet partagé', world.clientName)

    await world.clientPage.goto('/fr/portal/projects')
    await world.clientPage.getByRole('link', { name: /Projet partagé/ }).click()
    await world.clientPage.getByLabel(fr.portal.messages.placeholder).fill('Merci, c’est parfait.')
    await world.clientPage.getByRole('button', { name: fr.portal.messages.send }).click()

    await expect(world.clientPage.getByRole('main')).toContainText('Merci, c’est parfait.')

    await world.close()
  })

  /**
   * ==========================================================================
   * THE WALL, FROM BOTH SIDES.
   * ==========================================================================
   */
  test('gives a client 404 on every internal URL', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'wall')

    for (const url of [
      '/fr/app',
      '/fr/app/projects',
      '/fr/app/deliverables',
      '/fr/app/results',
      '/fr/app/clients',
      '/fr/app/team',
    ]) {
      const response = await world.clientPage.goto(url)
      // 404, never 403: confirming that the internal workspace exists is
      // itself a disclosure (CLAUDE.md §6).
      expect(response?.status(), url).toBe(404)
    }

    await world.close()
  })

  test('gives an internal member 404 on the portal', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'internal-on-portal')

    const response = await page.goto('/fr/portal')
    expect(response?.status()).toBe(404)
  })

  test('sends an anonymous visitor to sign-in, not to a 403', async ({ page }) => {
    await page.goto('/fr/portal')
    await expect(page).toHaveURL(/\/fr\/sign-in/)
  })

  /**
   * One client never sees another, even inside the same agency. The portal is
   * the place where that failure would be most expensive.
   */
  test('never shows one client another client’s project', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'two-clients', { clientName: 'Client A' })

    await shareProject(world.agencyPage, 'Projet de A', 'Client A')

    // A second client of the SAME agency, with a shared project of its own.
    await world.agencyPage.goto('/fr/app/clients')
    await world.agencyPage.getByRole('button', { name: fr.clients.new }).first().click()
    await world.agencyPage.getByLabel(fr.clients.form.name).fill('Client B')
    await world.agencyPage.getByRole('button', { name: fr.common.save }).click()
    await shareProject(world.agencyPage, 'Projet de B', 'Client B')

    await world.clientPage.goto('/fr/portal/projects')
    const main = world.clientPage.getByRole('main')
    await expect(main).toContainText('Projet de A')
    await expect(main).not.toContainText('Projet de B')

    await world.close()
  })

  test('has no horizontal overflow at 375px', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'overflow')
    await shareProject(world.agencyPage, 'Projet mobile', world.clientName)

    await world.clientPage.setViewportSize({ width: 375, height: 800 })
    for (const url of [
      '/fr/portal',
      '/fr/portal/projects',
      '/fr/portal/deliverables',
      '/fr/portal/results',
      '/fr/portal/messages',
    ]) {
      await world.clientPage.goto(url)
      // Measured, not eyeballed: a page that scrolls sideways moves every
      // target on it (ADR-049).
      const overflow = await world.clientPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, url).toBeLessThanOrEqual(0)
    }

    await world.close()
  })
})
