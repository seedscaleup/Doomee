import { z } from 'zod'

/**
 * ============================================================================
 * THE SMART FORM ENGINE.
 *
 * A results form is DATA (ADR-008): rows in `result_form_fields`, chosen by the
 * action's type. This file turns those rows into a validator at runtime, so no
 * form is hard-coded and adding a field to a template is a seed, not a release.
 *
 * Pure on purpose — it takes field descriptors and returns a Zod schema, with
 * no database of its own. That is what makes "the engine accepts what the
 * template declares, and refuses everything else" testable in isolation.
 * ============================================================================
 */
export type FieldKind =
  | 'number'
  | 'percent'
  | 'currency'
  | 'text'
  | 'longtext'
  | 'url'
  | 'date'
  | 'select'
  | 'boolean'

export type FormField = {
  key: string
  kind: FieldKind
  labels: Record<string, string>
  help?: Record<string, string> | null
  metricId?: string | null
  metricCode?: string | null
  unit?: string | null
  isRequired: boolean
  sortOrder: number
  options?: { value: string; labels: Record<string, string> }[] | null
  defaultValue?: string | null
  min?: string | null
  max?: string | null
}

export type FormTemplate = {
  id: string
  code: string
  labels: Record<string, string>
  version: number
  fields: FormField[]
}

/** What the browser submits: every field as a string, as forms do. */
export type RawFormValues = Record<string, string | undefined>

/**
 * Builds the validator for one template.
 *
 * Every field is optional unless the template says otherwise — a result nobody
 * can finish is a result nobody records (rule 10). An EMPTY value is not an
 * invalid value: it is an unanswered question, and the schema drops it rather
 * than failing on it.
 */
export function buildFormSchema(fields: readonly FormField[]): z.ZodType<RawFormValues> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    shape[field.key] = fieldSchema(field)
  }

  // `strict` matters: a key the template does not declare is either a stale
  // form or someone posting by hand, and neither should reach the database
  // where `field_key` is meant to be the audit trail of a number.
  return z.object(shape).strict() as unknown as z.ZodType<RawFormValues>
}

function fieldSchema(field: FormField): z.ZodTypeAny {
  const base = rawSchemaFor(field)

  if (field.isRequired) {
    return base.refine((value) => value !== undefined && value !== '', {
      message: 'required',
    })
  }

  return base.optional()
}

function rawSchemaFor(field: FormField): z.ZodTypeAny {
  switch (field.kind) {
    case 'number':
    case 'percent':
    case 'currency':
      return numberSchema(field)

    case 'boolean':
      // A checkbox posts 'on' or nothing; a select posts 'true'/'false'.
      return z.union([z.literal(''), z.literal('on'), z.literal('true'), z.literal('false')])

    case 'date':
      return z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])

    case 'url':
      return z.union([z.literal(''), z.url().max(2000)])

    case 'select': {
      const values = (field.options ?? []).map((option) => option.value)
      if (values.length === 0) return z.union([z.literal(''), z.string().max(200)])
      return z.union([z.literal(''), z.enum(values as [string, ...string[]])])
    }

    case 'longtext':
      return z.string().max(4000)

    default:
      return z.string().max(500)
  }
}

/**
 * Numbers arrive as strings and stay strings all the way to `numeric(20,4)`.
 *
 * Parsing to a JS number here would round what the column can hold exactly, and
 * the value in question is often money (CLAUDE.md §7 — jamais de float). The
 * bounds are checked on the parsed value and the ORIGINAL string is kept.
 */
function numberSchema(field: FormField): z.ZodTypeAny {
  const min = field.min === null || field.min === undefined ? null : Number(field.min)
  const max = field.max === null || field.max === undefined ? null : Number(field.max)

  return z.union([z.literal(''), z.string().regex(/^-?\d{1,16}(\.\d{1,4})?$/)]).refine(
    (value) => {
      if (value === '') return true
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return false
      if (min !== null && parsed < min) return false
      if (max !== null && parsed > max) return false
      return true
    },
    { message: 'out_of_range' },
  )
}

/**
 * The values worth storing: the answered questions.
 *
 * An unanswered field is omitted rather than stored as zero — "nobody counted
 * the impressions" and "there were none" are different facts, and only one of
 * them is bad news.
 */
export function answeredValues(raw: RawFormValues): Record<string, string> {
  const answered: Record<string, string> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const trimmed = value.trim()
    if (trimmed.length === 0) continue
    answered[key] = trimmed
  }

  return answered
}

/**
 * The numeric answers, by metric code — the input the derived metrics need.
 *
 * Only fields wired to a metric count: a field without one is recorded and
 * simply not aggregated.
 */
export function metricValuesOf(
  fields: readonly FormField[],
  answered: Record<string, string>,
): Record<string, number> {
  const values: Record<string, number> = {}

  for (const field of fields) {
    if (!field.metricCode) continue
    const raw = answered[field.key]
    if (raw === undefined) continue

    const parsed = Number(raw)
    if (Number.isFinite(parsed)) values[field.metricCode] = parsed
  }

  return values
}

/** Sorted the way the template declares. One place, so every renderer agrees. */
export function orderedFields(fields: readonly FormField[]): FormField[] {
  return [...fields].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.key.localeCompare(right.key)
  })
}
