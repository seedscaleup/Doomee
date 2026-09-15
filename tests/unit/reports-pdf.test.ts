import { describe, expect, it } from 'vitest'
import { renderReportPdf, slugify } from '@/modules/reports/export'
import type { PdfReport } from '@/modules/reports/pdf/document'
import { preferencesFor, presentSection } from '@/modules/reports/present'

/**
 * ============================================================================
 * THE PDF, actually rendered.
 *
 * A PDF is the one artefact in the product that leaves it: once a client has
 * the file, nothing can be corrected in place. So this asserts on the BYTES —
 * that a document is produced, that it carries the right language, and that no
 * section quietly throws the whole export away.
 * ============================================================================
 */
function reportOf(overrides: Partial<PdfReport> = {}): PdfReport {
  const preferences = preferencesFor(overrides.locale ?? 'fr', 'UTC')

  return {
    title: 'Rapport mensuel',
    locale: 'fr',
    organizationName: 'Agence Doomee',
    projectName: 'Refonte du site',
    clientName: null,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    publishedAt: '2026-10-01',
    sections: [
      {
        key: 'executive_summary',
        title: null,
        body: 'Un mois dense.',
        blocks: presentSection(
          'executive_summary',
          { actions_done: 12, deliverables_delivered: 3, results_recorded: 7, insights_written: 2 },
          preferences,
        ),
      },
      {
        key: 'objectives_comparison',
        title: null,
        body: null,
        blocks: presentSection(
          'objectives_comparison',
          {
            objectives: [
              {
                title: 'Coût par lead',
                target_value: '10',
                current_value: '7',
                direction: 'down',
                achievement_percent: '130',
              },
            ],
          },
          preferences,
        ),
      },
    ],
    ...overrides,
  }
}

/** Latin-1 is enough to find the strings a standard-14 font writes uncompressed. */
function textOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

describe('renderReportPdf', () => {
  it('produces a PDF', async () => {
    const bytes = await renderReportPdf(reportOf())

    expect(textOf(bytes).slice(0, 5)).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(1000)
  }, 30_000)

  it('carries the report’s title, its organisation and its language', async () => {
    const french = textOf(await renderReportPdf(reportOf()))
    expect(french).toContain('Rapport mensuel')
    expect(french).toContain('Agence Doomee')
    expect(french).toContain('/Lang')
  }, 30_000)

  /**
   * ADR-011, end to end: the document's language is the REPORT's, and nothing
   * in this call mentions an interface or a request. An English export from a
   * French interface is the lot's exit criterion.
   */
  it('renders the same data in two languages', async () => {
    const fr = textOf(await renderReportPdf(reportOf({ locale: 'fr' })))
    const en = textOf(await renderReportPdf(reportOf({ locale: 'en' })))

    expect(fr).not.toEqual(en)
  }, 30_000)

  /** A report with nothing in it is still a document, not a crash. */
  it('renders a report whose sections are all empty', async () => {
    const bytes = await renderReportPdf(
      reportOf({
        sections: [
          {
            key: 'results',
            title: null,
            body: null,
            blocks: presentSection('results', {}, preferencesFor('fr', 'UTC')),
          },
        ],
      }),
    )

    expect(textOf(bytes).slice(0, 5)).toBe('%PDF-')
  }, 30_000)

  /** No section, no body, no scope: the degenerate case a first export hits. */
  it('renders a report with no sections at all', async () => {
    const bytes = await renderReportPdf(
      reportOf({ sections: [], projectName: null, clientName: null, publishedAt: null }),
    )
    expect(textOf(bytes).slice(0, 5)).toBe('%PDF-')
  }, 30_000)

  /**
   * No `Font.register` with a URL anywhere: rendering must not make a network
   * call. A CDN hiccup is not an acceptable reason for a client's report not to
   * exist (rule 13).
   */
  it('embeds no font fetched over the network', async () => {
    const { PDF_FONT, PDF_FONT_BOLD } = await import('@/modules/reports/pdf/fonts')
    expect(PDF_FONT).toBe('Helvetica')
    expect(PDF_FONT_BOLD).toBe('Helvetica-Bold')
  })
})

describe('slugify', () => {
  it('makes a filename a person can find again', () => {
    expect(slugify('Rapport mensuel — septembre')).toBe('rapport-mensuel-septembre')
    expect(slugify('Été 2026 : bilan')).toBe('ete-2026-bilan')
  })

  it('never produces an empty name', () => {
    expect(slugify('')).toBe('report')
    expect(slugify('———')).toBe('report')
  })

  it('bounds the length', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
