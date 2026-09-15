'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import type { Locale } from '@/i18n/routing'
import { createObjective, updateObjective } from '@/modules/objectives/mutations'
import { allowedTransitions } from '@/modules/objectives/service'
import type {
  MetricOption,
  ObjectiveRow,
  ObjectiveStatusValue,
  PersonOption,
  TaxonomyOption,
} from '@/modules/objectives/types'

/**
 * Create and edit share one sheet, so the two cannot drift apart in wording,
 * layout or validation.
 *
 * The metric is the field that matters: it decides how results will be
 * aggregated over the period and whether more is better — which is what makes
 * the gap computable at all.
 */
export function ObjectiveFormSheet({
  open,
  projectId,
  objective,
  metrics,
  types,
  people,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean
  projectId: string
  objective: ObjectiveRow | null
  metrics: MetricOption[]
  types: TaxonomyOption[]
  people: PersonOption[]
  locale: Locale
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('objectives.form')
  const tStatus = useTranslations('status.objective')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  const statuses: readonly ObjectiveStatusValue[] = objective
    ? [objective.status, ...allowedTransitions(objective.status)]
    : (['draft', 'active'] as const)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      title: String(form.get('title')),
      description: asOptional(form.get('description')),
      objectiveTypeId: asOptional(form.get('objectiveTypeId')),
      metricId: asOptional(form.get('metricId')),
      targetValue: asOptional(form.get('targetValue')),
      unit: asOptional(form.get('unit')),
      currency: asOptional(form.get('currency')),
      periodStart: asOptional(form.get('periodStart')),
      periodEnd: asOptional(form.get('periodEnd')),
      status: String(form.get('status')) as ObjectiveStatusValue,
      ownerUserId: asOptional(form.get('ownerUserId')),
      isClientVisible: form.get('isClientVisible') === 'on',
    }

    try {
      if (objective) await updateObjective({ id: objective.id, ...payload })
      else await createObjective({ projectId, ...payload })
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={objective ? t('editTitle') : t('createTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('title')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="title"
            defaultValue={objective?.title ?? ''}
            required
            minLength={2}
          />
        )}
      </Field>

      <Field label={t('description')}>
        {({ id }) => (
          <TextInput id={id} name="description" defaultValue={objective?.description ?? ''} />
        )}
      </Field>

      <Field label={t('type')}>
        {({ id }) => (
          <Select id={id} name="objectiveTypeId" defaultValue={objective?.objectiveTypeId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.labels[locale] ?? type.code}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('metric')} hint={t('metricHint')}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            name="metricId"
            aria-describedby={describedBy}
            defaultValue={objective?.metricId ?? ''}
          >
            <option value="">{t('noMetric')}</option>
            {metrics.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.labels[locale] ?? metric.code}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('targetValue')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="targetValue"
            inputMode="decimal"
            defaultValue={objective?.targetValue ?? ''}
          />
        )}
      </Field>

      <Field label={t('unit')}>
        {({ id }) => <TextInput id={id} name="unit" defaultValue={objective?.unit ?? ''} />}
      </Field>

      {/* A currency without an amount is refused by the schema: half a money
          value is what makes a gap incomputable later (ADR-024). */}
      <Field label={t('currency')} hint={t('currencyHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="currency"
            maxLength={3}
            aria-describedby={describedBy}
            defaultValue={objective?.currency ?? ''}
          />
        )}
      </Field>

      <Field label={t('periodStart')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="periodStart"
            type="date"
            defaultValue={objective?.periodStart ?? ''}
          />
        )}
      </Field>

      <Field label={t('periodEnd')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="periodEnd"
            type="date"
            defaultValue={objective?.periodEnd ?? ''}
          />
        )}
      </Field>

      <Field label={t('status')}>
        {({ id }) => (
          <Select id={id} name="status" defaultValue={objective?.status ?? 'draft'}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('owner')}>
        {({ id }) => (
          <Select id={id} name="ownerUserId" defaultValue={objective?.ownerUserId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <label className="flex min-h-touch items-center gap-2 text-label">
        <input
          type="checkbox"
          name="isClientVisible"
          className="size-4"
          defaultChecked={objective?.isClientVisible ?? true}
        />
        {t('isClientVisible')}
      </label>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}
