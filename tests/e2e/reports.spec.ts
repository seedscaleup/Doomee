import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { buildPortalWorld, shareProject } from './helpers/portal'
import { enterWorkspace } from './helpers/workspace'

type Page = import('@playwright/test').Page

/**
 * ============================================================================
 * REPORTING, END TO END — the LOT's exit criterion.
 *
 *   "générer un rapport EN ANGLAIS depuis une interface EN FRANÇAIS,
 *    le publier, le partager, le client le consulte"
 *
 * The two languages in that sentence are the point (ADR-011). A French agency
 * writing for an English client must not have to change their own screens, and
 * the document must not quietly come out in the language of whoever clicked.
 * ============================================================================
 */
test.describe('reporting', () => {
  test('generates an English report from a French interface, publishes it, shares it', async ({
    browser,
  }) => {
    const world = await buildPortalWorld(browser, 'reports')

    try {
      const agency = world.agencyPage
      await shareProject(agency, 'Campagne Été', world.clientName)

      // ── The assistant, in French, producing an English document ──────────
      await agency.goto('/fr/app/reports')
      await agency.getByRole('button', { name: fr.reports.new }).first().click()

      const wizard = agency.getByRole('dialog', { name: fr.reports.wizard.title })
      // A PROJECT report, because its default sections include the internal
      // `attention_points` — a monthly client report deliberately does not open
      // with the team's own list of what is going wrong.
      await wizard
        .getByLabel(fr.reports.wizard.type)
        .selectOption({ label: fr.reports.types.project })
      await wizard.getByLabel(fr.reports.wizard.name).fill('Summer campaign review')
      await wizard
        .getByLabel(fr.reports.wizard.project, { exact: true })
        .selectOption({ label: 'Campagne Été' })
      await wizard.getByLabel(fr.reports.wizard.locale).selectOption('en')
      await wizard.getByRole('button', { name: fr.reports.wizard.submit }).click()

      // The report opens in its editor, already filled in — never on the list.
      await expect(agency).toHaveURL(/\/fr\/app\/reports\/[0-9a-f-]{36}$/)
      await expect(agency.getByRole('heading', { level: 1 })).toHaveText('Summer campaign review')

      /**
       * The interface is French; the report's own section headings are
       * ENGLISH, because they belong to the document. Both on one screen is
       * exactly the case ADR-011 exists for.
       */
      const main = agency.getByRole('main')
      await expect(main).toContainText(fr.reports.editor.sections)
      await expect(main).toContainText(en.reports.sections.executive_summary)
      await expect(main).not.toContainText(fr.reports.sections.executive_summary)

      // ── What the client sees is chosen section by section ────────────────
      const attention = agency.locator('article', {
        hasText: en.reports.sections.attention_points,
      })
      // The internal section says so, and its switch cannot be turned on.
      await expect(attention).toContainText(fr.reports.editor.internalOnly)
      await expect(attention.getByRole('checkbox').nth(1)).toBeDisabled()

      // A sentence of the agency's own, in the report.
      const summary = agency.locator('article', {
        hasText: en.reports.sections.executive_summary,
      })
      await summary.getByLabel(fr.reports.editor.body).fill('A strong first month.')
      await summary.getByLabel(fr.reports.editor.body).blur()
      await expect(summary).toContainText(fr.reports.editor.saved)

      // ── Publishing freezes it ────────────────────────────────────────────
      await expect(main).toContainText(fr.reports.share.requiresPublished)
      await agency.getByRole('button', { name: fr.reports.editor.publish }).click()
      await agency
        .getByRole('dialog')
        .getByRole('button', { name: fr.reports.editor.publish })
        .click()

      await expect(main).toContainText(fr.reports.editor.publishedNotice)
      // The prose survives, it just stops being a field.
      await expect(main).toContainText('A strong first month.')

      /**
       * ── The PDF, from the artefact that actually ships ──────────────────
       *
       * Run against `output: 'standalone'` on purpose. PDFKit loads its
       * standard fonts by a path built at runtime, which Next's tracer cannot
       * see: the first version of this lot rendered PDFs perfectly in a unit
       * test and threw `Cannot find module …/Helvetica.cjs` in the build. Only
       * a request to the real server catches that.
       */
      await agency.getByRole('button', { name: fr.reports.editor.exportPdf }).click()
      const ready = agency.getByRole('link', { name: fr.reports.editor.exportReady })
      await expect(ready).toBeVisible({ timeout: 30_000 })

      const pdfUrl = await ready.getAttribute('href')
      expect(pdfUrl).toBeTruthy()

      const pdf = await agency.request.get(pdfUrl ?? '')
      expect(pdf.status()).toBe(200)
      expect(pdf.headers()['content-type']).toContain('application/pdf')
      // Handed over as a download: a document is never rendered in our origin.
      expect(pdf.headers()['content-disposition']).toContain('attachment')
      expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-')

      // ── Sharing: the link is shown ONCE ──────────────────────────────────
      await agency.getByRole('button', { name: fr.reports.share.create }).click()
      await expect(main).toContainText(fr.reports.share.onlyOnce)

      const link = await agency.locator('code').first().innerText()
      expect(link).toMatch(/\/share\/[A-Za-z0-9_-]{20,}$/)

      // ── The client opens it, with no session at all ──────────────────────
      const stranger = await browser.newContext()
      const strangerPage = await stranger.newPage()
      await strangerPage.goto(link)

      await expect(strangerPage.getByRole('heading', { level: 1 })).toHaveText(
        'Summer campaign review',
      )
      await expect(strangerPage.getByRole('main')).toContainText('A strong first month.')
      // In English, on a page nobody is signed in to.
      await expect(strangerPage.getByRole('main')).toContainText(
        en.reports.sections.executive_summary,
      )
      // The internal section is not on the page, whatever was ticked.
      await expect(strangerPage.getByRole('main')).not.toContainText(
        en.reports.sections.attention_points,
      )
      // A private document is never indexed.
      await expect(strangerPage.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/,
      )

      // ── And in the portal, for the signed-in contact ─────────────────────
      await world.clientPage.goto('/fr/portal/reports')
      await world.clientPage.getByRole('link', { name: /Summer campaign review/ }).click()
      await expect(world.clientPage.getByRole('heading', { level: 1 })).toHaveText(
        'Summer campaign review',
      )
      await expect(world.clientPage.getByRole('main')).toContainText('A strong first month.')
      await expect(world.clientPage.getByRole('main')).not.toContainText(
        en.reports.sections.attention_points,
      )

      // ── Revoking is immediate ────────────────────────────────────────────
      await agency.reload()
      await agency.getByRole('button', { name: fr.reports.share.revoke }).click()
      await agency
        .getByRole('dialog')
        .getByRole('button', { name: fr.reports.share.revoke })
        .click()
      await expect(main).toContainText(fr.reports.share.revoked)

      await strangerPage.goto(link)
      await expect(strangerPage.getByRole('heading', { level: 1 })).toHaveText(
        fr.reports.public.revokedTitle,
      )

      await stranger.close()
    } finally {
      await world.close()
    }
  })

  /** The same journey in English, because both catalogues must actually work. */
  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'reports-en')

    await page.goto('/en/app/reports')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.reports.title)
    await expect(page.getByRole('main')).toContainText(en.reports.emptyTitle)

    await page.getByRole('button', { name: en.reports.new }).first().click()
    const wizard = page.getByRole('dialog', { name: en.reports.wizard.title })
    await wizard.getByLabel(en.reports.wizard.name).fill('September')
    await wizard.getByLabel(en.reports.wizard.locale).selectOption('fr')
    await wizard.getByRole('button', { name: en.reports.wizard.submit }).click()

    await expect(page).toHaveURL(/\/en\/app\/reports\/[0-9a-f-]{36}$/)
    // English interface, French document.
    await expect(page.getByRole('main')).toContainText(en.reports.editor.sections)
    await expect(page.getByRole('main')).toContainText(fr.reports.sections.executive_summary)
  })

  test('refuses a link nobody issued, and says which refusal it is', async ({ page }) => {
    await page.goto('/share/this-token-was-never-issued')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      fr.reports.public.notFoundTitle,
    )
  })

  /** A report is a document. On a phone it must not scroll sideways (rule 9). */
  test('fits a phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    await enterWorkspace(page, 'fr', 'reports-mobile')
    await page.goto('/fr/app/reports')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.reports.title)

    await expect(await horizontalOverflow(page)).toBe(0)
    await context.close()
  })
})

/** How far the page itself scrolls sideways. Anything above zero is a bug. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
