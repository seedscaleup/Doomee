'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import { quickCreateAction } from '@/modules/actions/mutations'
import type { PersonOption, PriorityValue, ProjectOption } from '@/modules/actions/types'

const PRIORITIES: readonly PriorityValue[] = ['low', 'normal', 'high', 'urgent']

/**
 * Quick create — five fields, one of them required.
 *
 * "Less typing" (rule 10) is not a slogan here: an action that takes a minute
 * to record is an action nobody records, and a product that measures results
 * needs the work written down first. Everything else is filled in later, on the
 * action itself.
 */
export function QuickCreateSheet({
  open,
  projects,
  people,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  open: boolean
  projects: ProjectOption[]
  people: PersonOption[]
  defaultProjectId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('actions.quickCreate')
  const tPriority = useTranslations('priority')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    try {
      await quickCreateAction({
        projectId: String(form.get('projectId')),
        title: String(form.get('title')),
        assigneeId: asOptional(form.get('assigneeId')),
        dueDate: asOptional(form.get('dueDate')),
        priority: String(form.get('priority')) as PriorityValue,
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
      description={t('hint')}
      submitLabel={t('submit')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('titleField')}>
        {({ id }) => (
          <TextInput id={id} name="title" required minLength={2} placeholder={t('placeholder')} />
        )}
      </Field>

      <Field label={t('project')}>
        {({ id }) => (
          <Select id={id} name="projectId" defaultValue={defaultProjectId ?? ''} required>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* Left empty, the server assigns it to whoever is creating: the common
          case is someone writing down their own work. */}
      <Field label={t('assignee')}>
        {({ id }) => (
          <Select id={id} name="assigneeId" defaultValue="">
            <option value="">{tCommon('none')}</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('dueDate')}>
        {({ id }) => <TextInput id={id} name="dueDate" type="date" />}
      </Field>

      <Field label={t('priority')}>
        {({ id }) => (
          <Select id={id} name="priority" defaultValue="normal">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tPriority(priority)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}
