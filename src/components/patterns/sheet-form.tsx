'use client'

import { useState } from 'react'
import { Alert, Button } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'

/**
 * Create and edit happen in a sheet, not on a separate page: the list stays
 * behind it, so the user keeps their place and their context. On a phone it
 * slides up from the bottom, within thumb reach.
 *
 * "One thing at a time" (UX principle 2): one sheet, one job.
 */
export function SheetForm({
  open,
  title,
  description,
  submitLabel,
  cancelLabel,
  pendingLabel,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description?: string
  submitLabel: string
  cancelLabel: string
  pendingLabel: string
  error?: string | null
  onSubmit: (form: FormData) => Promise<void>
  onCancel: () => void
  children: React.ReactNode
}) {
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      await onSubmit(new FormData(event.currentTarget))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} variant="sheet">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {children}
        {/*
          Pinned to the bottom of the sheet.

          A long form — the action sheet has nineteen fields — put its Save
          button fifteen hundred pixels down on a phone, which is a scroll
          nobody should have to do to finish what they started (rule 9). It
          bleeds past the sheet's padding so the content scrolls behind it
          rather than beside it.
        */}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 pb-5 pt-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
