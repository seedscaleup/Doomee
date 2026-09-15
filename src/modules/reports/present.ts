import type { Locale } from '@/i18n/routing'
import { type FormatPreferences, formatDate, formatNumber } from '@/lib/format'
import { lookupMessage } from '@/lib/i18n/translator'
import type { SectionKey } from './service'

/**
 * ============================================================================
 * TURNING A SECTION'S DATA INTO BLOCKS — pure, and shared by every renderer.
 *
 * A section's `data` is whatever its provider found: raw SQL rows, snake_case,
 * numerics as strings. Three surfaces have to show it — the editor, the PDF and
 * the share page — and if each one shaped the rows itself they would drift, and
 * the PDF a client receives would stop matching the screen it was approved on.
 *
 * So the shaping happens ONCE, here, with no I/O: given a key and its data,
 * what rows, what columns, in what order.
 *
 * Two rules the type system enforces:
 *  · columns are i18n KEYS, never words — the renderer translates them in the
 *    REPORT's language, which is not the reader's (ADR-011);
 *  · every value arrives already formatted through `Intl`, because a number
 *    printed by hand is a number printed wrong (CLAUDE.md §8).
 * ============================================================================
 */
type Tone = 'success' | 'danger' | 'muted'

/**
 * A cell is either literal text or an i18n KEY — never a string that might be
 * one or the other. A single `text` field meant a key could be printed raw the
 * day somebody forgot to translate it, and `status.objective.achieved` on a
 * client's PDF is not a bug anyone notices in review.
 */
export type ReportCell =
  | { text: string; key?: never; tone?: Tone }
  | { key: string; text?: never; tone?: Tone }

export type ReportBlock =
  | { kind: 'stats'; items: { labelKey: string; value: string }[] }
  | { kind: 'table'; columnKeys: readonly string[]; rows: ReportCell[][] }
  | { kind: 'notes'; items: { title: string; body: string }[] }

type Row = Record<string, unknown>

export function preferencesFor(locale: Locale, timezone: string): FormatPreferences {
  return { locale, timezone, dateFormat: 'dd/MM/yyyy' }
}

export function presentSection(
  key: SectionKey,
  data: unknown,
  preferences: FormatPreferences,
): ReportBlock[] {
  const source = isRow(data) ? data : {}
  return PRESENTERS[key](source, preferences)
}

/**
 * ============================================================================
 * THE LABELS A SET OF BLOCKS NEEDS, RESOLVED IN THE REPORT'S LANGUAGE.
 *
 * Blocks carry i18n KEYS, not words, and the words must come from the
 * REPORT's catalogue rather than the reader's (ADR-011). A renderer running in
 * the browser only has the reader's catalogue, and a translator function
 * cannot cross the server/client boundary — so the exact keys a set of blocks
 * uses are resolved here, on the server, into a plain object that can.
 *
 * The E2E exit criterion of this lot found the alternative: an editor that
 * translated with `useTranslations` showed "Résumé exécutif" above a section
 * whose PDF says "Executive summary". An agency would have been approving a
 * document they had never actually read.
 * ============================================================================
 */
export function resolveLabels(
  locale: Locale,
  blocks: readonly ReportBlock[],
): Record<string, string> {
  const labels: Record<string, string> = {}

  for (const key of labelKeysOf(blocks)) {
    const full = key.includes('.') ? key : `reports.fields.${key}`
    // A missing key prints its last segment rather than blanking a table (R7).
    labels[key] = lookupMessage(locale, full) ?? full.split('.').at(-1) ?? key
  }

  return labels
}

/** Every i18n key a set of blocks will ask for when it is rendered. */
export function labelKeysOf(blocks: readonly ReportBlock[]): string[] {
  return [...new Set(blocks.flatMap(keysOfBlock))]
}

function keysOfBlock(block: ReportBlock): string[] {
  if (block.kind === 'stats') return block.items.map((item) => item.labelKey)
  if (block.kind === 'notes') return []

  // A table asks for its column headers, and for every cell that carries a key
  // rather than literal text — a status, a risk level.
  return [...block.columnKeys, ...block.rows.flatMap(keysOfRow)]
}

function keysOfRow(row: readonly ReportCell[]): string[] {
  return row.flatMap((cell) => (cell.key === undefined ? [] : [cell.key]))
}

/** True when a section would print nothing, so the renderer can say so instead. */
export function isEmptySection(blocks: readonly ReportBlock[]): boolean {
  return blocks.every((block) =>
    block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0,
  )
}

/** The four figures a summary opens with, and the columns they come from. */
const SUMMARY_FIGURES: readonly (readonly [labelKey: string, field: string])[] = [
  ['actionsDone', 'actions_done'],
  ['deliverablesDelivered', 'deliverables_delivered'],
  ['resultsRecorded', 'results_recorded'],
  ['insightsWritten', 'insights_written'],
]

const PRESENTERS: Record<SectionKey, (data: Row, p: FormatPreferences) => ReportBlock[]> = {
  /**
   * Zeros are printed only for figures the provider actually returned.
   *
   * A provider that failed leaves `data` empty (R7), and four confident zeros
   * would then be a LIE — "nothing was delivered this period" instead of "this
   * could not be counted". A present zero is information and is kept; an
   * absent column is absent.
   */
  executive_summary: (data, p) => [
    {
      kind: 'stats',
      items: SUMMARY_FIGURES.filter(([, field]) => field in data).map(([labelKey, field]) => ({
        labelKey,
        value: formatNumber(int(data[field]), p),
      })),
    },
  ],

  objectives: (data, p) => [
    {
      kind: 'table',
      columnKeys: ['title', 'target', 'actual', 'achievement', 'status'],
      rows: rows(data.objectives).map((row) => [
        cell(text(row.title)),
        cell(decimal(row.target_value, p), 'muted'),
        cell(decimal(row.current_value, p)),
        achievementCell(row.achievement_percent, p),
        statusCell('objective', row.status),
      ]),
    },
  ],

  actions: (data, p) => [
    {
      kind: 'stats',
      items: rows(data.byStatus).map((row) => ({
        labelKey: `status.action.${text(row.status)}`,
        value: formatNumber(int(row.count), p),
      })),
    },
    {
      kind: 'table',
      columnKeys: ['title', 'completedAt'],
      rows: rows(data.completed).map((row) => [
        cell(text(row.title)),
        cell(day(row.completed_at, p), 'muted'),
      ]),
    },
  ],

  deliverables: (data, p) => [
    {
      kind: 'table',
      columnKeys: ['title', 'status', 'dueDate'],
      rows: rows(data.deliverables).map((row) => [
        cell(text(row.title)),
        statusCell('deliverable', row.status),
        cell(day(row.due_date, p), 'muted'),
      ]),
    },
  ],

  /**
   * One row per (metric, currency) pair — never one row per metric with the
   * amounts added up. Two currencies are two facts (ADR-024), and a report is
   * the last place where they should be quietly merged into one.
   */
  results: (data, p) => [
    {
      kind: 'table',
      columnKeys: ['metric', 'value', 'samples'],
      rows: rows(data.metrics).map((row) => [
        cell(label(row.labels, p.locale) || text(row.code)),
        cell(measure(row.total, row.decimals, row.unit, row.currency, p)),
        cell(formatNumber(int(row.samples), p), 'muted'),
      ]),
    },
  ],

  objectives_comparison: (data, p) => [
    {
      kind: 'table',
      columnKeys: ['title', 'target', 'actual', 'gap', 'achievement'],
      rows: rows(data.objectives).map((row) => {
        const target = num(row.target_value)
        const current = num(row.current_value)
        return [
          cell(text(row.title)),
          cell(decimal(row.target_value, p), 'muted'),
          cell(decimal(row.current_value, p)),
          gapCell(target, current, text(row.direction), p),
          achievementCell(row.achievement_percent, p),
        ]
      }),
    },
  ],

  analysis: (data, p) => [
    {
      kind: 'notes',
      items: rows(data.analyses).map((row) => ({
        title: `${text(row.title)} · ${day(row.recorded_for, p)}`.trim(),
        body: text(row.analysis),
      })),
    },
  ],

  insights: (data) => [
    {
      kind: 'notes',
      items: rows(data.insights).flatMap((row) =>
        [row.what_worked, row.what_we_learned, row.recommendation]
          .map(text)
          .filter((body) => body.length > 0)
          .map((body) => ({ title: text(row.title), body })),
      ),
    },
  ],

  attention_points: (data, p) => [
    {
      kind: 'stats',
      // Same rule as the summary: a zero the provider found, never a zero the
      // renderer invented.
      items:
        'overdueActions' in data
          ? [{ labelKey: 'overdueActions', value: formatNumber(int(data.overdueActions), p) }]
          : [],
    },
    {
      kind: 'table',
      columnKeys: ['title', 'level', 'mitigation'],
      rows: rows(data.risks).map((row) => [
        cell(text(row.title)),
        levelCell(text(row.level)),
        cell(text(row.mitigation_plan), 'muted'),
      ]),
    },
  ],

  recommendations: (data) => [
    {
      kind: 'notes',
      items: rows(data.recommendations).map((row) => ({
        title: text(row.title),
        body: text(row.recommendation),
      })),
    },
  ],

  next_steps: (data, p) => [
    {
      kind: 'table',
      columnKeys: ['title', 'dueDate'],
      rows: rows(data.nextActions).map((row) => [
        cell(text(row.title)),
        cell(day(row.due_date, p), 'muted'),
      ]),
    },
  ],
}

/* -------------------------------------------------------------------------- */

function cell(text: string, tone?: ReportCell['tone']): ReportCell {
  return tone ? { text, tone } : { text }
}

/**
 * A status is rendered from its i18n KEY, never from the database.
 *
 * `status.objective.achieved` and `status.deliverable.approved` are different
 * words in the same column, so the entity travels with the value: translating
 * a bare `approved` would eventually render a deliverable's word on an
 * objective (CLAUDE.md §13).
 */
function statusCell(entity: 'objective' | 'deliverable', value: unknown): ReportCell {
  return { key: `status.${entity}.${text(value)}`, tone: 'muted' }
}

function levelCell(level: string): ReportCell {
  return {
    key: `riskLevel.${level}`,
    tone: level === 'critical' ? 'danger' : level === 'low' ? 'muted' : undefined,
  }
}

/** A percentage, toned at 100 %. Missing stays missing rather than becoming 0 %. */
function achievementCell(value: unknown, p: FormatPreferences): ReportCell {
  const percent = num(value)
  if (percent === null) return { text: '—', tone: 'muted' }

  return {
    text: `${formatNumber(Math.round(percent), p)} %`,
    tone: percent >= 100 ? 'success' : percent < 50 ? 'danger' : undefined,
  }
}

/**
 * The gap, and WHICH WAY IS GOOD.
 *
 * `direction` comes from the metric (ADR-047): for a cost per lead, being under
 * target is the win. Printing a red minus sign on the best number of the page
 * is exactly the mistake that rule exists to prevent.
 */
function gapCell(
  target: number | null,
  current: number | null,
  direction: string,
  p: FormatPreferences,
): ReportCell {
  if (target === null || current === null) return { text: '—', tone: 'muted' }

  const gap = current - target
  const good = direction === 'down' ? gap <= 0 : gap >= 0
  const sign = gap > 0 ? '+' : ''

  return { text: `${sign}${formatNumber(gap, p)}`, tone: good ? 'success' : 'danger' }
}

/**
 * A measurement, printed at the metric's own precision.
 *
 * The value arrives as a STRING from `numeric(20,4)` and is converted here and
 * nowhere earlier (ADR-050): this is the display edge, past which precision no
 * longer has to survive.
 */
function measure(
  value: unknown,
  decimals: unknown,
  unit: unknown,
  currency: unknown,
  p: FormatPreferences,
): string {
  const formatted = formatDecimalString(value, Math.min(Math.max(int(decimals), 0), 4), p.locale)
  if (formatted === null) return '—'

  const suffix = text(currency) || text(unit)
  return suffix ? `${formatted} ${suffix}` : formatted
}

/**
 * Formats a `numeric(20,4)` WITHOUT ever turning it into a `number`.
 *
 * ADR-050 keeps a measurement as a string from the database to the screen
 * because a double carries 15 to 17 significant digits and `numeric(20,4)`
 * carries 24: `Number('9007199254740.9931')` comes back as `…740.992`, and a
 * report is precisely the document where a silently rounded figure stops being
 * proof. A test asserting the exact digits caught this file doing it.
 *
 * So the digits are never converted: `Intl` groups the integer part, and the
 * fraction is padded or truncated as characters.
 */
export function formatDecimalString(
  value: unknown,
  decimals: number,
  locale: Locale,
): string | null {
  const raw =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null

  const negative = raw.startsWith('-')
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.')
  const rounded = roundHalfUp(whole, fraction, decimals)

  const grouped = new Intl.NumberFormat(intl(locale), {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(BigInt(rounded.whole))

  const sign = negative && !isZero(rounded) ? '-' : ''
  if (decimals === 0) return `${sign}${grouped}`

  return `${sign}${grouped}${decimalSeparator(locale)}${rounded.fraction}`
}

/**
 * Half-up rounding on the DIGITS, with the carry done in `BigInt`.
 *
 * Truncating instead would print a cost per lead of 12.3456 as 12.34, which is
 * neither what `Intl` does anywhere else in the product nor what a reader
 * checking the figure against their own spreadsheet expects.
 */
function roundHalfUp(
  whole: string,
  fraction: string,
  decimals: number,
): { whole: string; fraction: string } {
  const padded = fraction.padEnd(decimals + 1, '0')
  const kept = padded.slice(0, decimals)
  const next = padded.charAt(decimals)

  if (next < '5') return { whole, fraction: kept }

  // `1` at the last kept position, added as an integer so a run of nines
  // carries all the way into the whole part: 9.99 at one decimal is 10.0.
  const carried = (BigInt(`${whole}${kept}` || '0') + 1n).toString().padStart(decimals + 1, '0')

  return {
    whole: decimals === 0 ? carried : carried.slice(0, carried.length - decimals),
    fraction: decimals === 0 ? '' : carried.slice(carried.length - decimals),
  }
}

function isZero(value: { whole: string; fraction: string }): boolean {
  return /^0*$/.test(value.whole) && /^0*$/.test(value.fraction)
}

function intl(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GB'
}

/** Asked of `Intl` rather than hard-coded: the comma is not universal. */
function decimalSeparator(locale: Locale): string {
  return (
    new Intl.NumberFormat(intl(locale)).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  )
}

function decimal(value: unknown, p: FormatPreferences): string {
  const parsed = num(value)
  return parsed === null ? '—' : formatNumber(parsed, p)
}

function day(value: unknown, p: FormatPreferences): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDate(new Date(`${value.slice(0, 10)}T00:00:00Z`), { ...p, timezone: 'UTC' })
  }
  if (value instanceof Date) return formatDate(value, p)
  return ''
}

/** A `labels jsonb {fr,en}` column, read in the REPORT's language (rule 7). */
function label(value: unknown, locale: Locale): string {
  if (!isRow(value)) return ''
  return text(value[locale]) || text(value.fr) || text(value.en)
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : []
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function int(value: unknown): number {
  return num(value) ?? 0
}
