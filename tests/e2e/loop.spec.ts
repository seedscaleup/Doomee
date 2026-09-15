import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace } from './helpers/workspace'

type Page = import('@playwright/test').Page

/**
 * ============================================================================
 * THE LOOP, END TO END — the test that proves the value proposition.
 *
 *   OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE →
 *   INSIGHT → RECOMMANDATION → PROCHAINE ACTION
 *
 * Every other suite proves that one step works. This one proves that they
 * connect: that a number recorded on Monday becomes a decision on Tuesday and
 * a task on Wednesday, without anyone retyping anything.
 *
 * If this test passes, Doomee is what it claims to be. If it stops passing,
 * the product has become a collection of screens again.
 * ============================================================================
 */
test.describe('the central loop', () => {
  test('travels from an objective to the next action it produced', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'loop')

    // ── 1. OBJECTIF ────────────────────────────────────────────────────────
    await createProject(page, 'Campagne de lancement')
    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await page.getByRole('button', { name: fr.objectives.new }).click()
    const objectiveSheet = page.getByRole('dialog', { name: fr.objectives.form.createTitle })
    await objectiveSheet.getByLabel(fr.objectives.form.title).fill('1 000 impressions')
    await objectiveSheet
      .getByLabel(fr.objectives.form.metric)
      .selectOption({ label: 'Impressions' })
    await objectiveSheet.getByLabel(fr.objectives.form.targetValue).fill('1000')
    await objectiveSheet.getByRole('button', { name: fr.common.save }).click()
    await expect(objectiveSheet).toBeHidden()

    // The loop strip now says the next step is an ACTION.
    await page.getByRole('tab', { name: fr.projects.tabs.overview }).click()
    await expect(page.getByRole('main')).toContainText(
      fr.insights.loop.blocked.replace('{step}', fr.insights.loop.step.action),
    )

    // ── 2. ACTION ──────────────────────────────────────────────────────────
    await createAction(page, 'Publier le carrousel', 'Publication réseaux sociaux')
    await completeAction(page)

    // ── 3. RÉSULTAT + ANALYSE ──────────────────────────────────────────────
    await page.getByRole('button', { name: fr.results.add }).first().click()
    const resultForm = page.getByRole('dialog', { name: fr.results.form.title })
    await resultForm.getByLabel('Impressions', { exact: true }).fill('1500')
    await resultForm.getByLabel(fr.results.form.analysis).fill('Le format carrousel surperforme.')
    await resultForm
      .getByLabel(fr.results.form.recommendation)
      .fill('Refaire un carrousel chaque semaine.')
    await resultForm.getByRole('button', { name: fr.common.save }).click()
    await expect(resultForm).toBeHidden()

    // The objective filled itself, in the same transaction (ADR-053).
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Campagne de lancement' }).click()
    await page.getByRole('tab', { name: fr.projects.tabs.objectives }).click()
    await expect(page.getByRole('main')).toContainText('1 500')

    // ── 4. INSIGHT, pre-filled from the result ─────────────────────────────
    await page.goto('/fr/app/results')
    await page.getByRole('link', { name: fr.insights.fromResult }).first().click()

    const insightSheet = page.getByRole('dialog', { name: fr.insights.form.createTitle })
    await expect(insightSheet).toBeVisible()
    // The analysis and the recommendation arrived WITH the click. The reading
    // was done once when the result was recorded (ADR-066).
    await expect(insightSheet.getByLabel(fr.insights.form.whatWeLearned)).toHaveValue(
      'Le format carrousel surperforme.',
    )
    await expect(insightSheet.getByLabel(fr.insights.form.recommendation)).toHaveValue(
      'Refaire un carrousel chaque semaine.',
    )

    await insightSheet.getByLabel(fr.insights.form.name).fill('Le carrousel surperforme')
    await insightSheet.getByLabel(fr.insights.form.whatWorked).fill('Le carrousel.')
    await insightSheet.getByRole('button', { name: fr.common.save }).click()
    await expect(insightSheet).toBeHidden()

    // ── 5. PROCHAINE ACTION, from the recommendation ───────────────────────
    await page.goto('/fr/app/insights')
    await page.getByRole('button', { name: 'Le carrousel surperforme' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Le carrousel surperforme')

    // The insight knows which result it stands on.
    await expect(page.getByRole('main')).toContainText(fr.insights.results.title)

    await page.getByRole('button', { name: fr.insights.nextAction.cta }).click()
    // The title arrived pre-filled from the recommendation.
    await expect(page.getByLabel(fr.insights.nextAction.actionTitle)).toHaveValue(
      'Refaire un carrousel chaque semaine.',
    )
    // Scoped to the form: the page header carries a Save button of its own.
    const nextActionForm = page.locator('form').filter({
      has: page.getByLabel(fr.insights.nextAction.actionTitle),
    })
    await nextActionForm.getByRole('button', { name: fr.common.save }).click()

    // The action exists, and the insight says so.
    await expect(page.getByRole('main')).toContainText('Refaire un carrousel chaque semaine.')

    // ── 6. THE LOOP IS CLOSED ──────────────────────────────────────────────
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Campagne de lancement' }).click()
    await expect(page.getByRole('main')).toContainText(fr.insights.loop.closed)

    // And the new action is a real action, on the project, in the list.
    await page.goto('/fr/app/actions')
    await expect(page.getByRole('main')).toContainText('Refaire un carrousel chaque semaine.')
  })

  /**
   * The button that closes the loop refuses to open an empty form. An insight
   * with no recommendation has nothing to act on, and the product says so
   * rather than offering a trip that ends in a refusal (ADR-041).
   */
  test('refuses to draw an action from an insight that recommends nothing', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'no-reco')
    await createProject(page, 'Projet sans reco')

    await page.goto('/fr/app/insights')
    await page.getByRole('button', { name: fr.insights.new }).first().click()
    const sheet = page.getByRole('dialog', { name: fr.insights.form.createTitle })
    await sheet.getByLabel(fr.insights.form.name).fill('Constat sans suite')
    await sheet.getByRole('button', { name: fr.common.save }).click()
    await expect(sheet).toBeHidden()

    await page.getByRole('button', { name: 'Constat sans suite' }).click()
    const main = page.getByRole('main')

    await expect(main).toContainText(fr.insights.nextAction.needsRecommendation)
    await expect(page.getByRole('button', { name: fr.insights.nextAction.cta })).toHaveCount(0)
  })

  /** A brand-new project is stuck at the beginning, which is the useful advice. */
  test('sends an empty project back to its objectives', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'empty-loop')
    await createProject(page, 'Projet vide')

    await expect(page.getByRole('main')).toContainText(
      fr.insights.loop.blocked.replace('{step}', fr.insights.loop.step.objective),
    )
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'loop-en')

    await page.goto('/en/app/projects')
    await page.getByRole('button', { name: en.projects.new }).first().click()
    const sheet = page.getByRole('dialog', { name: en.projects.form.createTitle })
    await sheet.getByLabel(en.projects.form.name).fill('Launch campaign')
    await sheet.getByRole('button', { name: en.common.save }).click()
    await expect(sheet).toBeHidden()

    await page.getByRole('button', { name: 'Launch campaign' }).click()
    await expect(page.getByRole('main')).toContainText(en.insights.loop.title)
    await expect(page.getByRole('main')).toContainText(
      en.insights.loop.blocked.replace('{step}', en.insights.loop.step.objective),
    )
  })
})

async function createProject(page: Page, name: string) {
  await page.goto('/fr/app/projects')
  await page.getByRole('button', { name: fr.projects.new }).first().click()
  const sheet = page.getByRole('dialog', { name: fr.projects.form.createTitle })
  await sheet.getByLabel(fr.projects.form.name).fill(name)
  await sheet.getByRole('button', { name: fr.common.save }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

async function createAction(page: Page, title: string, actionType: string) {
  await page.goto('/fr/app/actions')
  await page.getByRole('button', { name: fr.actions.new }).first().click()
  const sheet = page.getByRole('dialog', { name: fr.actions.quickCreate.title })
  await sheet.getByLabel(fr.actions.quickCreate.titleField).fill(title)
  await sheet.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: title }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)

  await page.getByRole('button', { name: fr.common.save }).first().click()
  const edit = page.getByRole('dialog', { name: fr.actions.form.editTitle })
  await edit.getByLabel(fr.actions.form.actionType).selectOption({ label: actionType })
  await edit.getByRole('button', { name: fr.common.save }).click()
  await expect(edit).toBeHidden()
}

async function completeAction(page: Page) {
  await page.getByRole('button', { name: fr.status.action.in_progress, exact: true }).click()
  await page.getByRole('button', { name: fr.status.action.done, exact: true }).click()
  await expect(page.getByRole('main')).toContainText(fr.status.action.done)
}
