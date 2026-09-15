'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import { createRisk, updateRisk } from '@/modules/health/mutations'
import type { PersonOption, RiskRow } from '@/modules/health/types'

const LEVELS = ['low', 'medium', 'critical'] as const
const KINDS = ['risk', 'issue'] as const
const STATUSES = ['open', 'mitigated', 'closed'] as const

/**
 * Create and edit share one sheet, so the two paths cannot drift apart in
 * wording, layout or validation.
 *
 * Title and level are required; everything else is filled in as it becomes
 * known. A risk register that demands an impact analysis up front is a risk
 * register nobody writes to (*Less typing*, rule 10).
 */
export function RiskFormSheet({
  open,
  projectId,
  risk,
  people,
  onClose,
  onSaved,
}: {
  open: boolean
  projectId: string
  risk?: RiskRow
  people: PersonOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('risks.form')
  const tKind = useTranslations('risks.kind')
  const tLevel = useTranslations('riskLevel')
  const tStatus = useTranslations('status.risk')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      kind: String(form.get('kind')) as (typeof KINDS)[number],
      title: String(form.get('title')),
      description: asOptional(form.get('description')),
      level: String(form.get('level')) as (typeof LEVELS)[number],
      impact: asOptional(form.get('impact')),
      probability: asOptional(form.get('probability')),
      ownerUserId: asOptional(form.get('ownerUserId')),
      identifiedOn: asOptional(form.get('identifiedOn')),
      mitigationPlan: asOptional(form.get('mitigationPlan')),
      isClientVisible: form.get('isClientVisible') === 'on',
    }

    try {
      if (risk) {
        await updateRisk({
          id: risk.id,
          ...payload,
          status: String(form.get('status')) as (typeof STATUSES)[number],
        })
      } else {
        await createRisk({ projectId, ...payload })
      }
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={risk ? t('editTitle') : t('createTitle')}
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
            defaultValue={risk?.title}
            placeholder={t('namePlaceholder')}
            required
            minLength={2}
          />
        )}
      </Field>

      <Field label={t('kind')}>
        {({ id }) => (
          <Select id={id} name="kind" defaultValue={risk?.kind ?? 'risk'}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tKind(kind)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('level')}>
        {({ id }) => (
          <Select id={id} name="level" defaultValue={risk?.level ?? 'medium'}>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {tLevel(level)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {risk ? (
        <Field label={t('status')}>
          {({ id }) => (
            <Select id={id} name="status" defaultValue={risk.status}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tStatus(status)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t('description')}>
        {({ id }) => (
          <TextInput id={id} name="description" defaultValue={risk?.description ?? ''} />
        )}
      </Field>
      <Field label={t('impact')}>
        {({ id }) => <TextInput id={id} name="impact" defaultValue={risk?.impact ?? ''} />}
      </Field>

      {/* Never reaches the portal: `probability` is in the leak suite's
          denylist, and the view does not select it. */}
      <Field label={t('probability')} hint={t('probabilityHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="probability"
            aria-describedby={describedBy}
            defaultValue={risk?.probability ?? ''}
          />
        )}
      </Field>

      <Field label={t('mitigationPlan')}>
        {({ id }) => (
          <TextInput id={id} name="mitigationPlan" defaultValue={risk?.mitigationPlan ?? ''} />
        )}
      </Field>

      <Field label={t('owner')}>
        {({ id }) => (
          <Select id={id} name="ownerUserId" defaultValue={risk?.ownerUserId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('identifiedOn')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="identifiedOn"
            type="date"
            defaultValue={risk?.identifiedOn ?? ''}
          />
        )}
      </Field>

      <Field label={t('isClientVisible')}>
        {({ id }) => (
          <input
            id={id}
            className="size-4"
            type="checkbox"
            name="isClientVisible"
            defaultChecked={risk?.isClientVisible ?? false}
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
