'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import type { Locale } from '@/i18n/routing'
// The pure engine, not the barrel: the barrel is a server entrypoint (ADR-030).
import { deriveMetrics, missingInputsFor } from '@/modules/results/derived-metrics'
import {
  answeredValues,
  type FormField,
  type FormTemplate,
  metricValuesOf,
  orderedFields,
} from '@/modules/results/form-engine'
import { recordResult } from '@/modules/results/mutations'
import type { ResultNoteKind } from '@/modules/results/types'

/** The eight kinds of qualitative note, in the order a debrief usually goes. */
const NOTE_KINDS: readonly ResultNoteKind[] = [
  'observation',
  'positive',
  'negative',
  'difficulty',
  'audience_feedback',
  'client_feedback',
  'learning',
  'opportunity',
]

/**
 * ============================================================================
 * THE SMART FORM.
 *
 * Every field on this screen comes from `result_form_fields` (ADR-008). Nothing
 * here knows what a social media post or an ads campaign is measured by — it
 * renders what the template declares, and the server validates against the same
 * rows. A new field is a seed, not a release.
 * ============================================================================
 */
export function ResultFormSheet({
  open,
  projectId,
  actionId,
  template,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean
  projectId: string
  actionId?: string
  template: FormTemplate | null
  locale: Locale
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('results.form')
  const tResults = useTranslations('results')
  const tNotes = useTranslations('results.notes')
  const tDerived = useTranslations('results.derived')
  const tCommon = useTranslations('common')

  const [error, setError] = useState<string | null>(null)
  /** Mirrors the number inputs so the computed block can follow as you type. */
  const [values, setValues] = useState<Record<string, string>>({})

  const fields = useMemo(() => (template ? orderedFields(template.fields) : []), [template])

  /**
   * CTR, CPC, ROAS… shown as they become computable, never stored (ADR-047).
   * Seeing the ratio appear while typing is also the cheapest way to notice a
   * number was entered in the wrong box.
   */
  const derived = useMemo(() => deriveMetrics(metricValuesOf(fields, values)), [fields, values])

  if (!template) return null

  async function onSubmit(form: FormData) {
    setError(null)

    const raw: Record<string, string> = {}
    for (const field of fields) raw[field.key] = String(form.get(field.key) ?? '')

    const notes = NOTE_KINDS.map((kind) => ({
      kind,
      body: String(form.get(`note_${kind}`) ?? '').trim(),
    })).filter((note) => note.body.length > 0)

    try {
      await recordResult({
        projectId,
        actionId,
        templateId: (template as FormTemplate).id,
        recordedFor: String(form.get('recordedFor')),
        title: asOptional(form.get('title')),
        analysis: asOptional(form.get('analysis')),
        recommendation: asOptional(form.get('recommendation')),
        isClientVisible: form.get('isClientVisible') === 'on',
        values: answeredValues(raw),
        notes,
      })
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={t('title')}
      description={t('template', { name: template.labels[locale] ?? template.code })}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <p className="text-caption text-muted">{t('optional')}</p>

      <Field label={t('recordedFor')} hint={t('recordedForHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="recordedFor"
            type="date"
            aria-describedby={describedBy}
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        )}
      </Field>

      {fields.map((field) => (
        <SmartField
          key={field.key}
          field={field}
          locale={locale}
          onNumberChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
        />
      ))}

      {Object.keys(derived).length > 0 || fields.some((field) => field.metricCode) ? (
        <section className="flex flex-col gap-1 rounded-doomee border border-border bg-surface-sunken px-3 py-2">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-subtle">
            {tDerived('title')}
          </h3>
          <p className="text-caption text-subtle">{tDerived('hint')}</p>
          <DerivedList derived={derived} values={metricValuesOf(fields, values)} />
        </section>
      ) : null}

      {/* The qualitative half, in an accordion. Nobody fills in eight boxes,
          and nobody should have to scroll past eight empty ones either. */}
      <details className="rounded-doomee border border-border px-3 py-2">
        <summary className="flex min-h-touch cursor-pointer items-center text-label font-medium">
          {t('qualitative')}
        </summary>
        <div className="flex flex-col gap-4 pt-3">
          {NOTE_KINDS.map((kind) => (
            <Field key={kind} label={tNotes(kind)}>
              {({ id }) => <TextInput id={id} name={`note_${kind}`} />}
            </Field>
          ))}
        </div>
      </details>

      {/* The two questions that turn a measurement into a decision. */}
      <Field label={t('analysis')} hint={t('analysisHint')}>
        {({ id, describedBy }) => (
          <TextInput id={id} name="analysis" aria-describedby={describedBy} />
        )}
      </Field>

      <Field label={t('recommendation')} hint={t('recommendationHint')}>
        {({ id, describedBy }) => (
          <TextInput id={id} name="recommendation" aria-describedby={describedBy} />
        )}
      </Field>

      <Field label={tResults('columns.title')}>
        {({ id }) => <TextInput id={id} name="title" />}
      </Field>

      <label className="flex min-h-touch items-center gap-2 text-label">
        <input type="checkbox" name="isClientVisible" className="size-4" />
        {t('isClientVisible')}
      </label>
    </SheetForm>
  )
}

/** One field, rendered from its row. The `kind` decides the control. */
function SmartField({
  field,
  locale,
  onNumberChange,
}: {
  field: FormField
  locale: Locale
  onNumberChange: (value: string) => void
}) {
  const label = field.labels[locale] ?? field.key
  const help = field.help?.[locale]

  if (field.kind === 'select') {
    return (
      <Field label={label} hint={help}>
        {({ id, describedBy }) => (
          <Select id={id} name={field.key} aria-describedby={describedBy} defaultValue="">
            <option value="" />
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.labels[locale] ?? option.value}
              </option>
            ))}
          </Select>
        )}
      </Field>
    )
  }

  if (field.kind === 'boolean') {
    return (
      <label className="flex min-h-touch items-center gap-2 text-label">
        <input type="checkbox" name={field.key} className="size-4" />
        {label}
      </label>
    )
  }

  const numeric = field.kind === 'number' || field.kind === 'percent' || field.kind === 'currency'

  return (
    <Field label={label} hint={help}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          name={field.key}
          aria-describedby={describedBy}
          type={field.kind === 'date' ? 'date' : 'text'}
          inputMode={numeric ? 'decimal' : undefined}
          required={field.isRequired}
          defaultValue={field.defaultValue ?? ''}
          onChange={numeric ? (event) => onNumberChange(event.target.value) : undefined}
        />
      )}
    </Field>
  )
}

function DerivedList({
  derived,
  values,
}: {
  derived: Record<string, number>
  values: Record<string, number>
}) {
  const t = useTranslations('results.derived')
  const codes = ['ctr', 'conversion_rate', 'cpl', 'cpc', 'roas', 'roi'] as const

  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {codes.map((code) => {
        const value = derived[code]
        const missing = missingInputsFor(code, values)

        // Nothing to say about a metric whose inputs were never going to be
        // collected on this form.
        if (value === undefined && missing.length === 2) return null

        return (
          <div key={code} className="flex flex-col gap-0.5">
            <dt className="text-caption uppercase tracking-wide text-subtle">{code}</dt>
            <dd className="text-label tabular-nums">
              {value === undefined ? t('missing', { inputs: missing.join(', ') }) : value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}
