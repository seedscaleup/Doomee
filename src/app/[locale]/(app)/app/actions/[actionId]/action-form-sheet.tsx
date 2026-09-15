'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import type { Locale } from '@/i18n/routing'
import { setActionCollaborators, updateAction } from '@/modules/actions/mutations'
import { allowedTransitions } from '@/modules/actions/service'
import type {
  ActionDetail,
  ActionStatusValue,
  PersonOption,
  PriorityValue,
  TaxonomyOption,
} from '@/modules/actions/types'

const PRIORITIES: readonly PriorityValue[] = ['low', 'normal', 'high', 'urgent']

/**
 * The full action form.
 *
 * Quick create writes the same row with fewer fields; this is where the rest is
 * filled in once someone has actually thought about the work.
 */
export function ActionFormSheet({
  open,
  action,
  collaborators,
  taxonomies,
  people,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean
  action: ActionDetail
  collaborators: PersonOption[]
  taxonomies: { types: TaxonomyOption[]; categories: TaxonomyOption[]; channels: TaxonomyOption[] }
  people: PersonOption[]
  locale: Locale
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('actions.form')
  const tStatus = useTranslations('status.action')
  const tPriority = useTranslations('priority')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  /** Only the moves the machine accepts from here, plus staying put. */
  const statuses: readonly ActionStatusValue[] = [
    action.status,
    ...allowedTransitions(action.status),
  ]

  async function onSubmit(form: FormData) {
    setError(null)
    try {
      await updateAction({
        id: action.id,
        title: String(form.get('title')),
        description: asOptional(form.get('description')),
        status: String(form.get('status')) as ActionStatusValue,
        priority: String(form.get('priority')) as PriorityValue,
        assigneeId: asNullable(form.get('assigneeId')),
        actionTypeId: asNullable(form.get('actionTypeId')),
        categoryId: asNullable(form.get('categoryId')),
        channelId: asNullable(form.get('channelId')),
        startDate: asOptional(form.get('startDate')),
        dueDate: asOptional(form.get('dueDate')),
        estimatedMinutes: asNumber(form.get('estimatedMinutes')),
        spentMinutes: asNumber(form.get('spentMinutes')),
        isClientVisible: form.get('isClientVisible') === 'on',
        blockedReason: asOptional(form.get('blockedReason')),
      })

      await setActionCollaborators({
        actionId: action.id,
        userIds: form.getAll('collaborators').map(String).filter(Boolean),
      })

      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  const option = (item: TaxonomyOption) => (
    <option key={item.id} value={item.id}>
      {item.labels[locale] ?? item.code}
    </option>
  )

  return (
    <SheetForm
      open={open}
      title={t('editTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('title')}>
        {({ id }) => (
          <TextInput id={id} name="title" defaultValue={action.title} required minLength={2} />
        )}
      </Field>

      <Field label={t('description')}>
        {({ id }) => (
          <TextInput id={id} name="description" defaultValue={action.description ?? ''} />
        )}
      </Field>

      <Field label={t('status')}>
        {({ id }) => (
          <Select id={id} name="status" defaultValue={action.status}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* A blocked action must say why. The server refuses it otherwise, so the
          field is offered here rather than left to be discovered. */}
      <Field label={t('blockedReason')} hint={t('blockedReasonHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="blockedReason"
            aria-describedby={describedBy}
            defaultValue={action.blockedReason ?? ''}
          />
        )}
      </Field>

      <Field label={t('priority')}>
        {({ id }) => (
          <Select id={id} name="priority" defaultValue={action.priority}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tPriority(priority)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('assignee')}>
        {({ id }) => (
          <Select id={id} name="assigneeId" defaultValue={action.assigneeId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('collaborators')} hint={t('collaboratorsHint')}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            name="collaborators"
            multiple
            size={4}
            aria-describedby={describedBy}
            defaultValue={collaborators.map((person) => person.userId)}
          >
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('actionType')}>
        {({ id }) => (
          <Select id={id} name="actionTypeId" defaultValue={action.actionTypeId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {taxonomies.types.map(option)}
          </Select>
        )}
      </Field>

      <Field label={t('category')}>
        {({ id }) => (
          <Select id={id} name="categoryId" defaultValue={action.categoryId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {taxonomies.categories.map(option)}
          </Select>
        )}
      </Field>

      <Field label={t('channel')}>
        {({ id }) => (
          <Select id={id} name="channelId" defaultValue={action.channelId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {taxonomies.channels.map(option)}
          </Select>
        )}
      </Field>

      <Field label={t('startDate')}>
        {({ id }) => (
          <TextInput id={id} name="startDate" type="date" defaultValue={action.startDate ?? ''} />
        )}
      </Field>

      <Field label={t('dueDate')}>
        {({ id }) => (
          <TextInput id={id} name="dueDate" type="date" defaultValue={action.dueDate ?? ''} />
        )}
      </Field>

      <Field label={t('estimatedMinutes')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="estimatedMinutes"
            inputMode="numeric"
            defaultValue={action.estimatedMinutes ?? ''}
          />
        )}
      </Field>

      <Field label={t('spentMinutes')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="spentMinutes"
            inputMode="numeric"
            defaultValue={action.spentMinutes ?? ''}
          />
        )}
      </Field>

      <label className="flex min-h-touch items-center gap-2 text-label">
        <input
          type="checkbox"
          name="isClientVisible"
          className="size-4"
          defaultChecked={action.isClientVisible}
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

/** An emptied select means "no longer set", which is not the same as "unchanged". */
function asNullable(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function asNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? '').trim()
  if (text.length === 0) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}
