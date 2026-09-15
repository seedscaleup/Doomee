'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { EmptyState, StatusBadge } from '@/components/patterns'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { addComment, deleteComment } from '@/modules/actions/mutations'
import type { CommentRow, PersonOption } from '@/modules/actions/types'

/**
 * The discussion on an action.
 *
 * The visibility control sits next to the submit button and says out loud what
 * it does. Internal is the default (rule 2), and a comment becomes visible to
 * the client only by someone choosing it here — never by inheriting it from the
 * action, the project, or anything else.
 */
export function CommentsPanel({
  actionId,
  comments,
  people,
}: {
  actionId: string
  comments: CommentRow[]
  people: PersonOption[]
}) {
  const t = useTranslations('actions.comments')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Held onto NOW: `event.currentTarget` is only valid while the event is
    // being dispatched, and reading it after an await gives null — which throws
    // inside the try and reports a failure for a comment that was saved.
    const element = event.currentTarget
    const form = new FormData(element)
    const body = String(form.get('body')).trim()
    if (body.length === 0) return

    setError(null)
    setPending(true)
    try {
      await addComment({
        actionId,
        body,
        visibility: form.get('visibility') === 'shared' ? 'shared' : 'internal',
        mentionUserIds: form.getAll('mentions').map(String).filter(Boolean),
      })
      element.reset()
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(id: string) {
    setError(null)
    try {
      await deleteComment({ id })
      router.refresh()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <Field label={t('title')} hint={t('internalHint')}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="body"
              aria-describedby={describedBy}
              placeholder={t('placeholder')}
              required
            />
          )}
        </Field>

        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('visibility')}>
            {({ id }) => (
              <Select id={id} name="visibility" defaultValue="internal">
                <option value="internal">{t('internal')}</option>
                <option value="shared">{t('shared')}</option>
              </Select>
            )}
          </Field>

          {people.length > 0 ? (
            <Field label={t('mentions')}>
              {({ id }) => (
                <Select id={id} name="mentions" multiple size={1}>
                  {people.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? tCommon('loading') : t('submit')}
          </Button>
        </div>
      </form>

      {comments.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{comment.authorName ?? tCommon('none')}</span>
                <span className="text-caption text-subtle">
                  {format.dateTime(new Date(comment.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
                <StatusBadge
                  label={comment.visibility === 'shared' ? t('shared') : t('internal')}
                  tone={comment.visibility === 'shared' ? 'progress' : 'neutral'}
                />
                <Button variant="ghost" className="ml-auto" onClick={() => onDelete(comment.id)}>
                  {t('delete')}
                </Button>
              </div>
              <p className="text-label">{comment.body}</p>
              {comment.mentions.length > 0 ? (
                <p className="text-caption text-subtle">
                  {t('mentioned', { names: comment.mentions.join(', ') })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
