import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace } from './helpers/workspace'

async function createProject(page: import('@playwright/test').Page, name: string, locale = 'fr') {
  const messages = locale === 'fr' ? fr : en
  await page.goto(`/${locale}/app/projects`)
  await page.getByRole('button', { name: messages.projects.new }).first().click()
  await page.getByLabel(messages.projects.form.name).fill(name)
  await page.getByRole('button', { name: messages.common.save }).click()
  await expect(page.getByRole('main')).toContainText(name)
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

/**
 * Objectives are the FIRST step of the loop: without one, a result is a number
 * with nothing to compare it to.
 */
test.describe('defining a project’s objectives', () => {
  test('sets a target and shows the gap waiting to be filled', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'objectives')
    await createProject(page, 'Campagne notoriété')

    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await expect(page.getByText(fr.objectives.emptyTitle)).toBeVisible()

    await page.getByRole('button', { name: fr.objectives.new }).click()
    const sheet = page.getByRole('dialog', { name: fr.objectives.form.createTitle })
    await sheet.getByLabel(fr.objectives.form.title).fill('Atteindre 500 000 impressions')
    // The metric is what makes the gap computable: how to aggregate, and
    // whether more is better.
    await sheet.getByLabel(fr.objectives.form.metric).selectOption({ label: 'Impressions' })
    await sheet.getByLabel(fr.objectives.form.targetValue).fill('500000')
    await sheet.getByRole('button', { name: fr.common.save }).click()

    const main = page.getByRole('main')
    await expect(main).toContainText('Atteindre 500 000 impressions')
    // No result yet — and the screen says so rather than showing a bare dash.
    await expect(main).toContainText(fr.objectives.gap.noResult)
  })

  test('refuses a period that ends before it starts', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'objectives-period')
    await createProject(page, 'Projet daté')

    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await page.getByRole('button', { name: fr.objectives.new }).click()
    const sheet = page.getByRole('dialog', { name: fr.objectives.form.createTitle })
    await sheet.getByLabel(fr.objectives.form.title).fill('Période impossible')
    await sheet.getByLabel(fr.objectives.form.periodStart).fill('2026-06-01')
    await sheet.getByLabel(fr.objectives.form.periodEnd).fill('2026-01-01')
    await sheet.getByRole('button', { name: fr.common.save }).click()

    await expect(sheet.getByRole('alert')).toBeVisible()
  })

  test('refuses a currency with no amount to go with it (ADR-024)', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'objectives-currency')
    await createProject(page, 'Projet chiffré')

    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await page.getByRole('button', { name: fr.objectives.new }).click()
    const sheet = page.getByRole('dialog', { name: fr.objectives.form.createTitle })
    await sheet.getByLabel(fr.objectives.form.title).fill('Générer du chiffre')
    await sheet.getByLabel(fr.objectives.form.currency).fill('XOF')
    // No target value: half a money value is what makes a gap incomputable.
    await sheet.getByRole('button', { name: fr.common.save }).click()
    await expect(sheet.getByRole('alert')).toBeVisible()

    await sheet.getByLabel(fr.objectives.form.targetValue).fill('5000000')
    await sheet.getByRole('button', { name: fr.common.save }).click()

    // Shown with its currency, never converted.
    await expect(page.getByRole('main')).toContainText('Générer du chiffre')
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'objectives-en')
    await createProject(page, 'Awareness campaign', 'en')

    await page.getByRole('tab', { name: en.projects.tabs.objectives }).click()
    await page.getByRole('button', { name: en.objectives.new }).click()
    const sheet = page.getByRole('dialog', { name: en.objectives.form.createTitle })
    await sheet.getByLabel(en.objectives.form.title).fill('Reach 500k impressions')
    await sheet.getByLabel(en.objectives.form.metric).selectOption({ label: 'Impressions' })
    await sheet.getByLabel(en.objectives.form.targetValue).fill('500000')
    await sheet.getByRole('button', { name: en.common.save }).click()

    await expect(page.getByRole('main')).toContainText('Reach 500k impressions')
    await expect(page.getByRole('main')).toContainText(en.objectives.gap.noResult)
  })
})
