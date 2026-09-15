'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import { createProject, updateProject } from '@/modules/projects/mutations'
import { allowedTransitions } from '@/modules/projects/service'
import type {
  ClientOption,
  ColleagueOption,
  PriorityValue,
  ProjectStatusValue,
} from '@/modules/projects/types'

export type ProjectDraft = {
  id: string
  name: string
  code: string | null
  clientId: string | null
  description: string | null
  status: ProjectStatusValue
  priority: PriorityValue
  startDate: string | null
  endDate: string | null
  ownerUserId: string | null
  budgetAmount: string | null
  budgetCurrency: string | null
  isClientVisible: boolean
}

const PRIORITIES: readonly PriorityValue[] = ['low', 'normal', 'high', 'urgent']

/**
 * Create and edit share one sheet, so the two paths cannot drift apart in
 * wording, layout or validation.
 *
 * "Less typing" (rule 10): only the name is required. A project with nothing
 * but a name is a legitimate project on its first day.
 */
export function ProjectFormSheet({
  open,
  project,
  clients,
  colleagues,
  onClose,
  onSaved,
}: {
  open: boolean
  project?: ProjectDraft
  clients: ClientOption[]
  colleagues: ColleagueOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('projects.form')
  const tStatus = useTranslations('status.project')
  const tPriority = useTranslations('priority')
  const tCommon = useTranslations('common')
  const tProjects = useTranslations('projects')
  const [error, setError] = useState<string | null>(null)

  /**
   * Editing offers only the moves the state machine would accept, plus the
   * current one. The server checks again — this is about not presenting a
   * choice that is going to be refused (UX principle 5).
   */
  const statuses: readonly ProjectStatusValue[] = project
    ? [project.status, ...allowedTransitions(project.status)]
    : (['to_start', 'in_progress'] as const)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      name: String(form.get('name')),
      code: asOptional(form.get('code')),
      clientId: asOptional(form.get('clientId')),
      description: asOptional(form.get('description')),
      status: String(form.get('status')) as ProjectStatusValue,
      priority: String(form.get('priority')) as PriorityValue,
      startDate: asOptional(form.get('startDate')),
      endDate: asOptional(form.get('endDate')),
      ownerUserId: asOptional(form.get('ownerUserId')),
      budgetAmount: asOptional(form.get('budgetAmount')),
      budgetCurrency: asOptional(form.get('budgetCurrency')),
      isClientVisible: form.get('isClientVisible') === 'on',
    }

    try {
      if (project) await updateProject({ id: project.id, ...payload })
      else await createProject({ ...payload, timezone: browserTimezone() })
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={project ? t('editTitle') : t('createTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('name')}>
        {({ id }) => (
          <TextInput id={id} name="name" defaultValue={project?.name} required minLength={2} />
        )}
      </Field>

      <Field label={t('client')}>
        {({ id }) => (
          <Select id={id} name="clientId" defaultValue={project?.clientId ?? ''}>
            <option value="">{tProjects('noClient')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('owner')}>
        {({ id }) => (
          <Select id={id} name="ownerUserId" defaultValue={project?.ownerUserId ?? ''}>
            <option value="">{tCommon('none')}</option>
            {colleagues.map((colleague) => (
              <option key={colleague.userId} value={colleague.userId}>
                {colleague.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('status')}>
        {({ id }) => (
          <Select id={id} name="status" defaultValue={project?.status ?? 'to_start'}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('priority')}>
        {({ id }) => (
          <Select id={id} name="priority" defaultValue={project?.priority ?? 'normal'}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tPriority(priority)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('startDate')}>
        {({ id }) => (
          <TextInput id={id} name="startDate" type="date" defaultValue={project?.startDate ?? ''} />
        )}
      </Field>

      <Field label={t('endDate')}>
        {({ id }) => (
          <TextInput id={id} name="endDate" type="date" defaultValue={project?.endDate ?? ''} />
        )}
      </Field>

      <Field label={t('code')}>
        {({ id }) => <TextInput id={id} name="code" defaultValue={project?.code ?? ''} />}
      </Field>

      {/* Amount and currency sit together because they ARE one value (ADR-024).
          Zod refuses one without the other, so the form never offers them apart. */}
      <Field label={t('budgetAmount')} hint={t('budgetHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="budgetAmount"
            inputMode="decimal"
            aria-describedby={describedBy}
            defaultValue={project?.budgetAmount ?? ''}
          />
        )}
      </Field>

      <Field label={t('budgetCurrency')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="budgetCurrency"
            maxLength={3}
            defaultValue={project?.budgetCurrency ?? ''}
          />
        )}
      </Field>

      <label className="flex min-h-touch items-center gap-2 text-label">
        <input
          type="checkbox"
          name="isClientVisible"
          className="size-4"
          defaultChecked={project?.isClientVisible ?? true}
        />
        {t('isClientVisible')}
      </label>
    </SheetForm>
  )
}

/**
 * The creator's timezone is the best available guess for a new project, and it
 * is right nearly always: whoever sets a project up works on it. It is stored
 * on the project and editable afterwards, so it never silently follows anyone
 * around (R9).
 */
function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}
