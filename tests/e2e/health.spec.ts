import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { buildPortalWorld, shareProject } from './helpers/portal'
import { enterWorkspace } from './helpers/workspace'

type Page = import('@playwright/test').Page

async function createProject(page: Page, name: string, locale: 'fr' | 'en' = 'fr') {
  const m = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/app/projects`)
  await page.getByRole('button', { name: m.projects.new }).first().click()
  const sheet = page.getByRole('dialog', { name: m.projects.form.createTitle })
  await sheet.getByLabel(m.projects.form.name).fill(name)
  await sheet.getByRole('button', { name: m.common.save }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

async function flagRisk(
  page: Page,
  title: string,
  level: string,
  options: { shareWithClient?: boolean } = {},
) {
  await page.getByRole('tab', { name: fr.projects.tabs.risks }).click()
  await page.getByRole('button', { name: fr.risks.new }).click()

  const sheet = page.getByRole('dialog', { name: fr.risks.form.createTitle })
  await sheet.getByLabel(fr.risks.form.name).fill(title)
  await sheet.getByLabel(fr.risks.form.level).selectOption({ label: level })
  await sheet.getByLabel(fr.risks.form.mitigationPlan).fill('Relancer chaque lundi.')
  await sheet.getByLabel(fr.risks.form.probability).fill('Estimation interne confidentielle')
  if (options.shareWithClient) await sheet.getByLabel(fr.risks.form.isClientVisible).check()
  await sheet.getByRole('button', { name: fr.common.save }).click()
  await expect(sheet).toBeHidden()
}

/**
 * ============================================================================
 * SEEING THE TROUBLE — critère MVP 14.
 *
 * The point of this lot is that a manager opens one screen and knows what to
 * do today. These tests check that, and they check the wall around it: the
 * health score is internal, and it stays internal.
 * ============================================================================
 */
test.describe('project health and risks', () => {
  test('shows the score with the reasons behind it', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'health')
    await createProject(page, 'Refonte du site')

    const main = page.getByRole('main')
    await expect(main).toContainText(fr.health.title)
    // Said on the screen itself, not only in an ADR.
    await expect(main).toContainText(fr.health.internalOnly)

    // A critical risk drops the project to blocked, whatever the average says.
    await flagRisk(page, 'Le prestataire a deux semaines de retard', fr.riskLevel.critical)
    await page.getByRole('tab', { name: fr.projects.tabs.overview }).click()
    await expect(main).toContainText(fr.status.health.blocked)

    // And the reasons are one click away, in the reader's language.
    await page.getByRole('button', { name: fr.health.factors }).click()
    await expect(main).toContainText(fr.health.factorName.open_risks)
    await expect(main).toContainText('1 risque(s) ouvert(s), dont 1 critique(s).')
  })

  test('keeps a risk register on the project', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'register')
    await createProject(page, 'Campagne')

    await page.getByRole('tab', { name: fr.projects.tabs.risks }).click()
    await expect(page.getByRole('main')).toContainText(fr.risks.emptyTitle)

    await flagRisk(page, 'Budget serré', fr.riskLevel.medium)

    const main = page.getByRole('main')
    await expect(main).toContainText('Budget serré')
    await expect(main).toContainText(fr.riskLevel.medium)
    await expect(main).toContainText('Relancer chaque lundi.')
  })

  /**
   * ==========================================================================
   * 🔒 ADR-025, from the client's side.
   *
   * A shared risk reaches the portal. The health score does not, and neither
   * does the internal probability estimate.
   * ==========================================================================
   */
  test('shows a shared risk to the client and never the health score', async ({ browser }) => {
    const world = await buildPortalWorld(browser, 'health-portal')
    await shareProject(world.agencyPage, 'Projet suivi', world.clientName)

    await world.agencyPage.goto('/fr/app/projects')
    await world.agencyPage.getByRole('button', { name: 'Projet suivi' }).click()
    await flagRisk(world.agencyPage, 'Délai serré côté client', fr.riskLevel.medium, {
      shareWithClient: true,
    })
    await flagRisk(world.agencyPage, 'Risque interne', fr.riskLevel.critical)

    await world.clientPage.goto('/fr/portal/projects')
    await world.clientPage.getByRole('link', { name: /Projet suivi/ }).click()
    const main = world.clientPage.getByRole('main')

    // The health score is nowhere in the portal — not the label, not a number.
    await expect(main).not.toContainText(fr.health.title)
    await expect(main).not.toContainText(fr.status.health.blocked)
    await expect(main).not.toContainText(fr.status.health.at_risk)
    // Nor the internal estimate, on any screen.
    await expect(main).not.toContainText('Estimation interne confidentielle')
    // Nor the risk that was never shared.
    await expect(main).not.toContainText('Risque interne')

    await world.close()
  })

  /**
   * The screen a manager opens in the morning: four kinds, each a decision to
   * take today, each linking to where it gets taken.
   */
  test('gathers what needs a decision into one screen', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'alerts')

    await page.goto('/fr/app/alerts')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.alerts.title)
    // A fresh workspace has nothing wrong, and says so rather than showing an
    // empty table.
    await expect(page.getByRole('main')).toContainText(fr.alerts.empty)

    // An overdue action appears, with how late it is.
    await createProject(page, 'Projet en retard')
    await page.goto('/fr/app/actions')
    await page.getByRole('button', { name: fr.actions.new }).first().click()
    const quick = page.getByRole('dialog', { name: fr.actions.quickCreate.title })
    await quick.getByLabel(fr.actions.quickCreate.titleField).fill('Livrer la maquette')
    await quick.getByLabel(fr.actions.quickCreate.dueDate).fill(yesterday())
    await quick.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
    await expect(quick).toBeHidden()

    await page.goto('/fr/app/alerts')
    const main = page.getByRole('main')
    await expect(main).toContainText(fr.alerts.kind.overdue_action)
    await expect(main).toContainText('Livrer la maquette')
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'health-en')
    await createProject(page, 'Website rebuild', 'en')

    const main = page.getByRole('main')
    await expect(main).toContainText(en.health.title)
    await expect(main).toContainText(en.health.internalOnly)

    await page.goto('/en/app/alerts')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.alerts.title)
  })
})

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}
