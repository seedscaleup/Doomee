'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import type { Locale } from '@/i18n/routing'
import { createDeliverable, updateDeliverable } from '@/modules/deliverables/mutations'
import type { PersonOption, ProjectOption, TaxonomyOption } from '@/modules/deliverables/types'

export type DeliverableDraft = {
  id: string
  title: string
  description: string | null
  deliverableTypeId: string | null
  ownerUserId: string | null
  dueDate: string | null
  externalUrl: string | null
}

/**
 * Create and edit share one sheet, so the two paths cannot drift apart in
 * wording, layout or validation.
 *
 * "Less typing" (rule 10): only the title and the project are required. A
 * deliverable called "Charte graphique" with nothing else is a legitimate
 * deliverable on its first day.
 */
export function DeliverableFormSheet({
  open,
  deliverable,
  projectId,
  projects,
  types,
  owners,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean
  deliverable?: DeliverableDraft
  /** Fixed when the sheet is opened from a project; chosen otherwise. */
  projectId?: string
  projects: ProjectOption[]
  types: TaxonomyOption[]
  owners: PersonOption[]
  locale: Locale
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('deliverables.form')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      title: String(form.get('title')),
      description: asOptional(form.get('description')),
      deliverableTypeId: asOptional(form.get('deliverableTypeId')),
      ownerUserId: asOptional(form.get('ownerUserId')),
      dueDate: asOptional(form.get('dueDate')),
      externalUrl: asOptional(form.get('externalUrl')),
    }

    try {
      if (deliverable) await updateDeliverable({ id: deliverable.id, ...payload })
      else
        await createDeliverable({
          ...payload,
          projectId: projectId ?? String(form.get('projectId')),
        })
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={deliverable ? t('editTitle') : t('createTitle')}
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
            defaultValue={deliverable?.title}
            placeholder={t('namePlaceholder')}
            required
            minLength={2}
          />
        )}
      </Field>

      {deliverable || projectId ? null : (
        <Field label={t('project')}>
          {({ id }) => (
            <Select id={id} name="projectId" required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label={t('type')}>
        {({ id }) => (
          <Select
            id={id}
            name="deliverableTypeId"
            defaultValue={deliverable?.deliverableTypeId ?? ''}
          >
            <option value="">{t('noType')}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.labels[locale] ?? type.code}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('owner')}>
        {({ id }) => (
          <Select id={id} name="ownerUserId" defaultValue={deliverable?.ownerUserId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {owners.map((owner) => (
              <option key={owner.userId} value={owner.userId}>
                {owner.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('dueDate')}>
        {({ id }) => (
          <TextInput id={id} name="dueDate" type="date" defaultValue={deliverable?.dueDate ?? ''} />
        )}
      </Field>

      <Field label={t('externalUrl')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="externalUrl"
            type="url"
            defaultValue={deliverable?.externalUrl ?? ''}
          />
        )}
      </Field>

      <Field label={t('description')}>
        {({ id }) => (
          <TextInput id={id} name="description" defaultValue={deliverable?.description ?? ''} />
        )}
      </Field>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}
