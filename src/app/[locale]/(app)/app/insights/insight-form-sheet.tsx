'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import { createInsight, updateInsight } from '@/modules/insights/mutations'
import type { ClientOption, ProjectOption, ResultOption } from '@/modules/insights/types'

/**
 * A result an insight is being created FROM.
 *
 * Carries what the result already said, so the analysis and the recommendation
 * are not retyped — and the result is attached without anyone having to find
 * it in a list.
 */
export type InsightSource = {
  id: string
  projectId: string
  title: string
  analysis: string | null
  recommendation: string | null
}

export type InsightDraft = {
  id: string
  title: string
  projectId: string | null
  clientId: string | null
  whatWorked: string | null
  whatDidnt: string | null
  whatWeLearned: string | null
  recommendation: string | null
  periodStart: string | null
  periodEnd: string | null
  isClientVisible: boolean
}

/**
 * The four questions of a review meeting, in the order they get asked.
 *
 * Only the title is required. The rest gets filled over a meeting, sometimes
 * over two — a form that demanded all four would collect "n/a" four times
 * (*Less typing*, rule 10).
 */
export function InsightFormSheet({
  open,
  insight,
  projects,
  clients,
  results,
  source,
  onClose,
  onSaved,
}: {
  open: boolean
  insight?: InsightDraft
  projects: ProjectOption[]
  clients: ClientOption[]
  results: ResultOption[]
  /** Set when the insight is being created FROM a result (ADR-066). */
  source?: InsightSource
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('insights.form')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      projectId: asOptional(form.get('projectId')),
      clientId: asOptional(form.get('clientId')),
      title: String(form.get('title')),
      whatWorked: asOptional(form.get('whatWorked')),
      whatDidnt: asOptional(form.get('whatDidnt')),
      whatWeLearned: asOptional(form.get('whatWeLearned')),
      recommendation: asOptional(form.get('recommendation')),
      periodStart: asOptional(form.get('periodStart')),
      periodEnd: asOptional(form.get('periodEnd')),
      isClientVisible: form.get('isClientVisible') === 'on',
      resultIds: form.getAll('resultIds').map(String).filter(Boolean),
    }

    try {
      if (insight) await updateInsight({ id: insight.id, ...payload })
      else await createInsight(payload)
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={insight ? t('editTitle') : t('createTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('name')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="title"
            defaultValue={insight?.title ?? source?.title}
            placeholder={t('namePlaceholder')}
            required
            minLength={2}
          />
        )}
      </Field>

      <Field label={t('project')}>
        {({ id }) => (
          <Select
            id={id}
            name="projectId"
            defaultValue={insight?.projectId ?? source?.projectId ?? ''}
          >
            <option value="">{t('noProject')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('client')}>
        {({ id }) => (
          <Select id={id} name="clientId" defaultValue={insight?.clientId ?? ''}>
            <option value="">{t('noClient')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('whatWorked')}>
        {({ id }) => (
          <TextInput id={id} name="whatWorked" defaultValue={insight?.whatWorked ?? ''} />
        )}
      </Field>
      <Field label={t('whatDidnt')}>
        {({ id }) => <TextInput id={id} name="whatDidnt" defaultValue={insight?.whatDidnt ?? ''} />}
      </Field>
      <Field label={t('whatWeLearned')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="whatWeLearned"
            // The analysis the result already carries: the reading was done
            // once, and retyping it is how it stops being done at all.
            defaultValue={insight?.whatWeLearned ?? source?.analysis ?? ''}
          />
        )}
      </Field>
      <Field label={t('recommendation')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="recommendation"
            // The recommendation the result already carries — and the seed of
            // the next action, one screen later.
            defaultValue={insight?.recommendation ?? source?.recommendation ?? ''}
          />
        )}
      </Field>

      <Field label={t('periodStart')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="periodStart"
            type="date"
            defaultValue={insight?.periodStart ?? ''}
          />
        )}
      </Field>
      <Field label={t('periodEnd')}>
        {({ id }) => (
          <TextInput id={id} name="periodEnd" type="date" defaultValue={insight?.periodEnd ?? ''} />
        )}
      </Field>

      {results.length > 0 ? (
        <Field label={t('results')} hint={t('resultsHint')}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              name="resultIds"
              multiple
              aria-describedby={describedBy}
              defaultValue={source ? [source.id] : []}
              className="min-h-32"
            >
              {results.map((result) => (
                <option key={result.id} value={result.id}>
                  {result.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t('isClientVisible')} hint={t('isClientVisibleHint')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="size-4"
            type="checkbox"
            name="isClientVisible"
            defaultChecked={insight?.isClientVisible ?? false}
          />
        )}
      </Field>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}
