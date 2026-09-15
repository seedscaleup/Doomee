'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { createNextAction } from '@/modules/insights/mutations'
import { actionTitleFrom, canProduceAction } from '@/modules/insights/service'
import type { LinkedActionRow, ProjectOption } from '@/modules/insights/types'

/**
 * ============================================================================
 * `Create next action` — the last edge of the loop, as one button.
 *
 * This is the whole claim of the product in a single interaction: a
 * recommendation that nobody can act on in one click is a recommendation that
 * stays in a document.
 *
 * The title arrives PRE-FILLED from the recommendation and stays editable. The
 * recommendation is the action most of the time, but not always (*Less
 * typing*, rule 10 — and *Every action leads somewhere*).
 * ============================================================================
 */
export function NextActionPanel({
  insightId,
  recommendation,
  defaultProjectId,
  projects,
  people,
  existing,
  canCreate,
}: {
  insightId: string
  recommendation: string | null
  defaultProjectId: string | null
  projects: ProjectOption[]
  people: { userId: string; name: string }[]
  existing: LinkedActionRow[]
  canCreate: boolean
}) {
  const t = useTranslations('insights.nextAction')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // The server refuses it too. Hiding the button first means never offering a
  // trip that ends in a refusal (UX principle 5).
  const possible = canProduceAction({ recommendation })

  async function submit(form: FormData) {
    setError(null)
    setPending(true)
    try {
      await createNextAction({
        insightId,
        projectId: String(form.get('projectId')),
        title: String(form.get('title')),
        assigneeId: asOptional(form.get('assigneeId')),
        dueDate: asOptional(form.get('dueDate')),
      })
      setOpen(false)
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section">{t('title')}</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {existing.length === 0 ? (
        <p className="text-label text-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {existing.map((action) => (
            <li
              key={action.id}
              className="flex flex-wrap items-center gap-2 rounded-doomee border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-label">{action.title}</span>
              {action.assigneeName ? (
                <span className="text-caption text-subtle">{action.assigneeName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!canCreate ? null : !possible ? (
        // A blocked action says WHY (ADR-041).
        <p className="text-label text-muted">{t('needsRecommendation')}</p>
      ) : open ? (
        <form
          action={submit}
          className="flex flex-col gap-3 rounded-doomee border border-border bg-surface px-4 py-3"
        >
          <Field label={t('actionTitle')}>
            {({ id }) => (
              <TextInput
                id={id}
                name="title"
                // The recommendation, trimmed on a word boundary to what an
                // action title can hold.
                defaultValue={actionTitleFrom(recommendation ?? '')}
                required
                minLength={2}
              />
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {tCommon('save')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button onClick={() => setOpen(true)}>{t('cta')}</Button>
        </div>
      )}
    </section>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}
