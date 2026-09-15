'use client'

import { useFormatter } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { postPortalComment } from '@/modules/portal/mutations'
import type { PortalCommentRow } from '@/modules/portal/types'

/**
 * A shared conversation.
 *
 * Every message a client writes is SHARED — there is no internal option here,
 * and there is none on the server either: the policy refuses a comment that
 * claims to be internal. The note under the box says so, because a client who
 * does not know who reads their message writes a different message.
 */
export function PortalThread({
  entityType,
  entityId,
  comments,
  labels,
}: {
  entityType: 'project' | 'deliverable'
  entityId: string
  comments: PortalCommentRow[]
  labels: {
    empty: string
    placeholder: string
    send: string
    failed: string
    onlyShared: string
  }
}) {
  const router = useRouter()
  const format = useFormatter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function send() {
    const text = body.trim()
    if (text.length === 0) return

    setError(null)
    setPending(true)
    try {
      await postPortalComment({ entityType, entityId, body: text })
      setBody('')
      router.refresh()
    } catch {
      setError(labels.failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {comments.length === 0 ? (
        <p className="text-label text-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-2"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-label font-medium">{comment.authorName ?? '—'}</span>
                <span className="text-caption text-subtle">
                  {format.dateTime(new Date(comment.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </span>
              <p className="text-label">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <Field label={labels.placeholder} hint={labels.onlyShared}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            value={body}
            placeholder={labels.placeholder}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </Field>

      <div className="flex justify-end">
        <Button disabled={pending || body.trim().length === 0} onClick={send}>
          {labels.send}
        </Button>
      </div>
    </div>
  )
}
