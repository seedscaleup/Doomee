'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Button, Field, TextArea, TextInput } from '@/components/ui/field'
import { BlocksView } from '@/modules/reports/components/blocks-view'
import { regenerateSection, updateSection } from '@/modules/reports/mutations'
import { isInternalSection } from '@/modules/reports/service'
import type { EditableSection } from './types'

/**
 * One section: the data it found, the words a person adds, and the three
 * switches — in, ordered, and visible to the client.
 *
 * The client switch is DISABLED, not hidden, on an internal section. A hidden
 * control invites the question "why can I not share this one"; a disabled one
 * with a sentence next to it answers it (ADR-065 for the same choice on an
 * insight's `what_didnt`).
 */
export function SectionEditor({
  section,
  editable,
  isFirst,
  isLast,
  onChanged,
  onError,
}: {
  section: EditableSection
  editable: boolean
  isFirst: boolean
  isLast: boolean
  onChanged: () => void
  onError: () => void
}) {
  const t = useTranslations('reports.editor')
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [body, setBody] = useState(section.body ?? '')
  const [title, setTitle] = useState(section.titleOverride ?? '')

  const internal = isInternalSection(section.key)

  function save(patch: Parameters<typeof updateSection>[0] extends infer T ? Partial<T> : never) {
    setSaved(false)
    startTransition(async () => {
      try {
        await updateSection({ id: section.id, ...patch })
        setSaved(true)
        onChanged()
      } catch {
        onError()
      }
    })
  }

  return (
    <article
      className={`flex flex-col gap-3 rounded-doomee border border-border bg-surface p-4 ${
        section.isIncluded ? '' : 'opacity-60'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        {/* The section's own heading, in the REPORT's language. */}
        <h3 className="text-section font-semibold">{section.heading}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {section.isEdited ? (
            <span className="text-caption text-muted">{t('editedBadge')}</span>
          ) : null}
          {saved ? <span className="text-caption text-success-text">{t('saved')}</span> : null}
          {editable ? (
            <>
              <Button
                variant="ghost"
                onClick={() => save({ sortOrder: Math.max(0, section.sortOrder - 1) })}
                disabled={pending || isFirst}
                aria-label={t('moveUp')}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                onClick={() => save({ sortOrder: section.sortOrder + 1 })}
                disabled={pending || isLast}
                aria-label={t('moveDown')}
              >
                ↓
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {/* What the providers found. Read-only: the numbers are the report's
          evidence, and an editable number is not evidence. */}
      <BlocksView blocks={section.blocks} labels={section.labels} emptyLabel={t('empty')} />

      {editable ? (
        <div className="flex flex-col gap-3">
          <Field label={t('titleOverride')}>
            {({ id }) => (
              <TextInput
                id={id}
                value={title}
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => save({ titleOverride: title.trim() || null })}
              />
            )}
          </Field>

          <Field label={t('body')}>
            {({ id }) => (
              <TextArea
                id={id}
                value={body}
                placeholder={t('bodyPlaceholder')}
                maxLength={20_000}
                onChange={(event) => setBody(event.target.value)}
                onBlur={() => save({ body: body.trim() || null })}
              />
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-h-touch items-center gap-2 text-label">
              <input
                type="checkbox"
                className="size-5"
                checked={section.isIncluded}
                disabled={pending}
                onChange={(event) => save({ isIncluded: event.target.checked })}
              />
              {t('included')}
            </label>

            <label className="flex min-h-touch items-center gap-2 text-label">
              <input
                type="checkbox"
                className="size-5"
                checked={section.isClientVisible && !internal}
                disabled={pending || internal}
                onChange={(event) => save({ isClientVisible: event.target.checked })}
              />
              {internal ? t('internalOnly') : t('clientVisible')}
            </label>

            <Button
              variant="secondary"
              onClick={() =>
                startTransition(async () => {
                  try {
                    await regenerateSection({ id: section.id })
                    onChanged()
                  } catch {
                    onError()
                  }
                })
              }
              disabled={pending}
            >
              {t('regenerate')}
            </Button>
            <span className="text-caption text-muted">{t('regenerateWarning')}</span>
          </div>
        </div>
      ) : // Published: the prose stays readable, it just stops being a field.
      body ? (
        <p className="whitespace-pre-line">{body}</p>
      ) : null}
    </article>
  )
}
