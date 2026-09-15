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

async function createAction(page: Page, title: string, actionType?: string, project?: string) {
  await page.goto('/fr/app/actions')
  await page.getByRole('button', { name: fr.actions.new }).first().click()
  const sheet = page.getByRole('dialog', { name: fr.actions.quickCreate.title })
  await sheet.getByLabel(fr.actions.quickCreate.titleField).fill(title)
  // Quick create defaults to the first project. When a test has more than one,
  // saying which is the difference between measuring two projects and
  // measuring the same one twice.
  if (project) {
    await sheet.getByLabel(fr.actions.quickCreate.project).selectOption({ label: project })
  }
  await sheet.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
  await expect(page.getByRole('main')).toContainText(title)

  await page.getByRole('button', { name: title }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)

  if (actionType) {
    await page.getByRole('button', { name: fr.common.save }).first().click()
    const edit = page.getByRole('dialog', { name: fr.actions.form.editTitle })
    await edit.getByLabel(fr.actions.form.actionType).selectOption({ label: actionType })
    await edit.getByRole('button', { name: fr.common.save }).click()
    await expect(page.getByRole('main')).toContainText(actionType)
  }
}

async function completeAction(page: Page) {
  await page.getByRole('button', { name: fr.status.action.in_progress, exact: true }).click()
  await page.getByRole('button', { name: fr.status.action.done, exact: true }).click()
  await expect(page.getByRole('main')).toContainText(fr.status.action.done)
}

async function recordImpressions(page: Page, value: string) {
  await page.getByRole('button', { name: fr.results.add }).first().click()
  const form = page.getByRole('dialog', { name: fr.results.form.title })
  await form.getByLabel('Impressions', { exact: true }).fill(value)
  await form.getByRole('button', { name: fr.common.save }).click()
  await expect(form).toBeHidden()
}

/**
 * ============================================================================
 * THE LOOP, END TO END.
 *
 * `OBJECTIF → ACTION → RÉSULTAT → ÉCART`. This is the test that says whether
 * Doomee is what it claims to be rather than a task manager with extra tables.
 * ============================================================================
 */
test.describe('recording results', () => {
  test('closes an action, records results, and the objective gap moves', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'results')
    await createProject(page, 'Campagne Doomee')

    // 1. An objective: 1000 impressions.
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Campagne Doomee' }).click()
    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await page.getByRole('button', { name: fr.objectives.new }).click()
    const objective = page.getByRole('dialog', { name: fr.objectives.form.createTitle })
    await objective.getByLabel(fr.objectives.form.title).fill('Mille impressions')
    await objective.getByLabel(fr.objectives.form.metric).selectOption({ label: 'Impressions' })
    await objective.getByLabel(fr.objectives.form.targetValue).fill('1000')
    await objective.getByRole('button', { name: fr.common.save }).click()
    // Nothing measured yet.
    await expect(page.getByRole('main')).toContainText(fr.objectives.gap.noResult)

    // 2. An action of a type that has its own smart form.
    await createAction(page, 'Publier le carrousel', 'Publication réseaux sociaux')
    await completeAction(page)

    // 3. The product ASKS for results — it does not demand them.
    await expect(page.getByText(fr.results.addHint)).toBeVisible()
    await page.getByRole('button', { name: fr.results.add }).first().click()

    // 4. The form is the one the action's TYPE declares (ADR-008): a social
    //    post is measured by impressions and reach, not by pages delivered.
    const form = page.getByRole('dialog', { name: fr.results.form.title })
    await expect(form).toContainText('Impressions')
    await expect(form).toContainText('Portée')
    await expect(form).not.toContainText('Pages livrées')

    await form.getByLabel('Impressions', { exact: true }).fill('1500')
    await form.getByLabel('Clics', { exact: true }).fill('75')
    await form.getByLabel(fr.results.form.analysis).fill('Le format carrousel porte mieux')
    await form
      .getByLabel(fr.results.form.recommendation)
      .fill('Refaire un carrousel la semaine prochaine')
    await form.getByRole('button', { name: fr.common.save }).click()

    // 5. The result is attached to the action.
    await page.getByRole('tab', { name: fr.actions.tabs.results }).click()
    await expect(page.getByRole('main')).toContainText('Le format carrousel porte mieux')

    // 6. THE POINT: the objective's gap filled itself, in the same transaction
    //    as the result. 1500 of 1000 is 150%.
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Campagne Doomee' }).click()
    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()

    const main = page.getByRole('main')
    await expect(main).not.toContainText(fr.objectives.gap.noResult)
    await expect(main).toContainText(fr.objectives.gap.ahead)
    await expect(main).toContainText('150')
  })

  test('shows a computed metric as soon as its inputs exist, and not before', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'derived')
    await createProject(page, 'Campagne Ads')
    await createAction(page, 'Lancer la campagne', 'Campagne publicitaire')
    await completeAction(page)

    await page.getByRole('button', { name: fr.results.add }).first().click()
    const form = page.getByRole('dialog', { name: fr.results.form.title })

    // Clicks alone: a CTR needs impressions too, and the form says which.
    await form.getByLabel('Clics', { exact: true }).fill('50')
    await expect(form).toContainText('impressions')

    await form.getByLabel('Impressions', { exact: true }).fill('1000')
    // 50 / 1000 = 5%, derived at read time and never stored (ADR-047).
    await expect(form).toContainText('5')
  })

  test('the consolidated view compares the period to the one before', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'consolidated')
    await createProject(page, 'Projet mesuré')
    await createAction(page, 'Action mesurée', 'Publication réseaux sociaux')
    await completeAction(page)

    // The helper WAITS for the sheet to close. Navigating while the server
    // action is still in flight aborts it, and the page then honestly reports
    // no results — a race in the test, not a bug in the product.
    await recordImpressions(page, '2000')

    await page.goto('/fr/app/results')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.results.title)

    const main = page.getByRole('main')
    await expect(main).toContainText('Impressions')
    await expect(main).toContainText('2')
    // Nothing before it, so the comparison says so rather than inventing 0%.
    await expect(main).toContainText(fr.results.totals.noPrevious)
  })

  /**
   * Two projects, two very different numbers, one podium.
   *
   * The filters and the ranking are the difference between "we got 2500
   * impressions" and "the carousel worked and the banner did not" — the step of
   * the loop that turns a result into a next action.
   */
  test('names which project did best and which did worst', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'podium')

    await createProject(page, 'Projet fort')
    await createAction(page, 'Action forte', 'Publication réseaux sociaux', 'Projet fort')
    await completeAction(page)
    await recordImpressions(page, '9000')

    await createProject(page, 'Projet faible')
    await createAction(page, 'Action faible', 'Publication réseaux sociaux', 'Projet faible')
    await completeAction(page)
    await recordImpressions(page, '100')

    await page.goto('/fr/app/results')
    const main = page.getByRole('main')

    // No metric chosen yet: no podium claimed.
    await expect(main).toContainText(fr.results.performance.title)
    await expect(main).not.toContainText(fr.results.performance.best)

    await page.getByLabel(fr.results.performance.metric).selectOption({ label: 'Impressions' })

    await expect(main).toContainText(fr.results.performance.best)
    // Impressions are higher_is_better, so the big number leads.
    const best = main.getByRole('list').filter({ hasText: 'Projet fort' })
    await expect(best.first()).toContainText('Projet fort')
    await expect(main).toContainText('Projet faible')
  })

  /**
   * A filter that narrows the list must narrow the TOTALS too, or the page
   * shows one project's rows under every project's numbers.
   */
  /**
   * A filter that narrows the list must narrow the TOTALS too, or the page
   * shows one project's rows under every project's numbers.
   */
  test('a project filter narrows the rows and the totals together', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'filtre')

    await createProject(page, 'Projet visible')
    await createProject(page, 'Projet écarté')

    await createAction(page, 'Action visible', 'Publication réseaux sociaux', 'Projet visible')
    await completeAction(page)
    await recordImpressions(page, '4000')

    await createAction(page, 'Action écartée', 'Publication réseaux sociaux', 'Projet écarté')
    await completeAction(page)
    await recordImpressions(page, '11')

    await page.goto('/fr/app/results')
    const main = page.getByRole('main')

    // Unfiltered: both projects, and the two measurements added up.
    await expect(main).toContainText('4 011')

    await page.getByLabel(fr.results.filters.project).selectOption({ label: 'Projet visible' })

    /**
     * Scoped to the RESULT LIST, not to `main`: the project dropdown lists
     * every project by design, so asserting on the whole page would only ever
     * measure the filter's own options.
     */
    const list = main.getByRole('listitem').filter({ hasText: 'Résultat du' })
    await expect(list).toHaveCount(1)
    await expect(list.first()).toContainText('Projet visible')

    // 4000 alone, not 4011: the aggregate follows the filter.
    await expect(main).toContainText('4 000')
    await expect(main).not.toContainText('4 011')
    await expect(page.getByRole('button', { name: fr.results.filters.reset })).toBeVisible()
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'results-en')
    await createProject(page, 'Doomee campaign', 'en')

    await page.goto('/en/app/actions')
    await page.getByRole('button', { name: en.actions.new }).first().click()
    const quick = page.getByRole('dialog', { name: en.actions.quickCreate.title })
    await quick.getByLabel(en.actions.quickCreate.titleField).fill('Publish the carousel')
    await quick.getByRole('button', { name: en.actions.quickCreate.submit }).click()
    await page.getByRole('button', { name: 'Publish the carousel' }).click()

    await page.getByRole('button', { name: en.status.action.in_progress, exact: true }).click()
    await page.getByRole('button', { name: en.status.action.done, exact: true }).click()

    await expect(page.getByText(en.results.addHint)).toBeVisible()
    await page.getByRole('button', { name: en.results.add }).first().click()

    // No action type set, so the generic fallback: "record a result" is never
    // unavailable.
    const form = page.getByRole('dialog', { name: en.results.form.title })
    await form.getByLabel(en.results.form.analysis).fill('It reached more people than usual')
    await form.getByRole('button', { name: en.common.save }).click()

    await page.getByRole('tab', { name: en.actions.tabs.results }).click()
    await expect(page.getByRole('main')).toContainText('It reached more people than usual')
  })
})
