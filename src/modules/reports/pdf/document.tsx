import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Locale } from '@/i18n/routing'
import { formatDateLong } from '@/lib/format'
import { lookupMessage, translator } from '@/lib/i18n/translator'
import { isEmptySection, preferencesFor, type ReportBlock, type ReportCell } from '../present'
import type { SectionKey } from '../service'
import { PDF_FONT, PDF_FONT_BOLD } from './fonts'

/**
 * ============================================================================
 * THE REPORT, AS A PDF.
 *
 * Rendered from the SNAPSHOT (ADR-014) and in the REPORT's language, which is
 * a parameter and never the request's locale (ADR-011): a French team exports
 * an English report without changing their own interface.
 *
 * The brand rule survives the format change (CLAUDE.md §9): yellow is action
 * and energy, so exactly one yellow element carries the page — the rule under
 * the title — and nothing is set on a yellow ground. Everything that carries
 * text is `#111111` on white.
 * ============================================================================
 */
export type PdfSection = {
  key: SectionKey
  title: string | null
  body: string | null
  blocks: ReportBlock[]
}

export type PdfReport = {
  title: string
  locale: Locale
  organizationName: string
  projectName: string | null
  clientName: string | null
  periodStart: string
  periodEnd: string
  publishedAt: string | null
  sections: PdfSection[]
}

const COLOR = {
  black: '#111111',
  yellow: '#FFD21F',
  border: '#E8E8E3',
  muted: '#6B6B66',
  success: '#157A4E',
  danger: '#C4282D',
  surface: '#FFFFFF',
  band: '#FAFAF7',
} as const

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.surface,
    color: COLOR.black,
    fontFamily: PDF_FONT,
    fontSize: 10,
    lineHeight: 1.5,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  organization: { fontSize: 9, color: COLOR.muted, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontFamily: PDF_FONT_BOLD, fontSize: 22, marginTop: 6 },
  rule: { backgroundColor: COLOR.yellow, height: 4, width: 56, marginTop: 10, marginBottom: 10 },
  meta: { fontSize: 9, color: COLOR.muted },
  sectionTitle: { fontFamily: PDF_FONT_BOLD, fontSize: 13, marginBottom: 6 },
  section: { marginTop: 22 },
  body: { marginBottom: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  stat: {
    backgroundColor: COLOR.band,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 104,
  },
  statValue: { fontFamily: PDF_FONT_BOLD, fontSize: 16 },
  statLabel: { fontSize: 8, color: COLOR.muted, marginTop: 2 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.black,
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    paddingVertical: 5,
  },
  th: { fontFamily: PDF_FONT_BOLD, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { fontSize: 9 },
  note: {
    borderLeftWidth: 2,
    borderLeftColor: COLOR.border,
    paddingLeft: 10,
    marginBottom: 10,
  },
  noteTitle: { fontFamily: PDF_FONT_BOLD, fontSize: 10 },
  empty: { fontSize: 9, color: COLOR.muted, fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLOR.muted,
  },
})

export function ReportDocument({ report }: { report: PdfReport }) {
  const t = translator(report.locale)
  const preferences = preferencesFor(report.locale, 'UTC')
  const scope = report.projectName ?? report.clientName

  const period = `${formatDateLong(dayOf(report.periodStart), preferences)} — ${formatDateLong(
    dayOf(report.periodEnd),
    preferences,
  )}`

  return (
    <Document title={report.title} author={report.organizationName} language={report.locale}>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.organization}>{report.organizationName}</Text>
          <Text style={styles.title}>{report.title}</Text>
          <View style={styles.rule} />
          <Text style={styles.meta}>{scope ? `${scope} · ${period}` : period}</Text>
          {report.publishedAt ? (
            <Text style={styles.meta}>
              {t('reports.pdf.publishedOn', {
                date: formatDateLong(dayOf(report.publishedAt), preferences),
              })}
            </Text>
          ) : null}
        </View>

        {report.sections.map((section) => (
          <View key={section.key} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>
              {section.title ?? translateLabel(report.locale, `reports.sections.${section.key}`)}
            </Text>
            {section.body ? <Text style={styles.body}>{section.body}</Text> : null}
            <Blocks blocks={section.blocks} locale={report.locale} />
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{report.organizationName}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              t('reports.pdf.page', { page: pageNumber, total: totalPages })
            }
          />
        </View>
      </Page>
    </Document>
  )
}

function Blocks({ blocks, locale }: { blocks: ReportBlock[]; locale: Locale }) {
  const t = translator(locale)

  // A section that would print nothing says so, rather than leaving a heading
  // hanging over white space and letting a reader wonder what was lost (R7).
  if (isEmptySection(blocks)) {
    return <Text style={styles.empty}>{t('reports.pdf.noData')}</Text>
  }

  return (
    <View>
      {blocks.map((block, index) => (
        // The index is the identity here: blocks are a fixed, ordered list
        // produced by one presenter, never reordered and never keyed by data.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional by construction
        <Block key={index} block={block} locale={locale} />
      ))}
    </View>
  )
}

function Block({ block, locale }: { block: ReportBlock; locale: Locale }) {
  if (block.kind === 'stats') {
    return (
      <View style={styles.statsRow}>
        {block.items.map((item) => (
          <View key={item.labelKey} style={styles.stat}>
            <Text style={styles.statValue}>{item.value}</Text>
            <Text style={styles.statLabel}>{translateLabel(locale, item.labelKey)}</Text>
          </View>
        ))}
      </View>
    )
  }

  if (block.kind === 'notes') {
    return (
      <View>
        {block.items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: two notes may share a title
          <View key={index} style={styles.note} wrap={false}>
            <Text style={styles.noteTitle}>{item.title}</Text>
            <Text>{item.body}</Text>
          </View>
        ))}
      </View>
    )
  }

  if (block.rows.length === 0) return null
  const width = `${Math.floor(100 / block.columnKeys.length)}%`

  return (
    <View>
      <View style={styles.tableHead}>
        {block.columnKeys.map((key) => (
          <Text key={key} style={[styles.th, { width }]}>
            {translateLabel(locale, key)}
          </Text>
        ))}
      </View>
      {block.rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows carry no stable id here
        <View key={index} style={styles.tableRow} wrap={false}>
          {row.map((cell, column) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: column position is the identity
              key={column}
              style={[styles.td, { width }, toneStyle(cell.tone)]}
            >
              {cellText(cell, locale)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/**
 * The `-text` siblings, in PDF form (ADR-032). The screen tokens are tuned for
 * a 4.5:1 ratio on `#FAFAF7`; the same job on paper, where a reader cannot
 * increase the contrast, deserves at least as much.
 */
function toneStyle(tone: ReportCell['tone']) {
  if (tone === 'success') return { color: COLOR.success }
  if (tone === 'danger') return { color: COLOR.danger }
  if (tone === 'muted') return { color: COLOR.muted }
  return {}
}

function cellText(cell: ReportCell, locale: Locale): string {
  return cell.key === undefined ? cell.text : translateLabel(locale, cell.key)
}

/**
 * A missing key must not stop a report being produced (R7), so the key's last
 * segment is printed instead of throwing. `pnpm check:i18n` and the catalogue
 * parity test are what actually prevent the case.
 */
function translateLabel(locale: Locale, key: string): string {
  const full = key.includes('.') ? key : `reports.fields.${key}`
  return lookupMessage(locale, full) ?? full.split('.').at(-1) ?? full
}

function dayOf(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`)
}
