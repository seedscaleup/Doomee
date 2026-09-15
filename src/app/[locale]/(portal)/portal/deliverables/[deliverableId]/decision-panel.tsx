'use client'

import { useState } from 'react'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { decideOnDeliverable } from '@/modules/portal/mutations'

/**
 * `✓ Approve` / `↻ Request changes` — the client's half of the validation
 * cycle, and the only place in the product where these two buttons exist.
 *
 * They appear only while the deliverable is awaiting a decision. Once it has
 * been given, the panel says so instead of offering to give it again: a client
 * who approves twice has been told something misleading about the first time.
 */
export function DecisionPanel({
  deliverableId,
  status,
  labels,
}: {
  deliverableId: string
  status: string
  labels: {
    decide: string
    approve: string
    requestChanges: string
    comment: string
    commentRequired: string
    decided: string
    failed: string
  }
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (status !== 'client_review') {
    return <p className="text-label text-muted">{labels.decided}</p>
  }

  async function decide(decision: 'approved' | 'changes_requested') {
    setError(null)
    // Asked here for a fast answer, and by the schema on the server, which is
    // the one that decides. "Make it better" with no detail is the most
    // expensive message in agency work.
    if (decision === 'changes_requested' && comment.trim().length === 0) {
      setError(labels.commentRequired)
      return
    }

    setPending(true)
    try {
      await decideOnDeliverable({
        deliverableId,
        decision,
        comment: comment.trim() || undefined,
      })
      router.refresh()
    } catch {
      setError(labels.failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-doomee border border-border bg-surface px-4 py-3">
      <h2 className="text-label font-semibold">{labels.decide}</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label={labels.comment}>
        {({ id }) => (
          <TextInput id={id} value={comment} onChange={(event) => setComment(event.target.value)} />
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => decide('approved')}>
          {labels.approve}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => decide('changes_requested')}>
          {labels.requestChanges}
        </Button>
      </div>
    </div>
  )
}
