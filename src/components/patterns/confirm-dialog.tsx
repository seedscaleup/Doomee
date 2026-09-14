'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'

/**
 * Asked before anything irreversible. The destructive action is NOT the yellow
 * button: yellow means "go ahead, this is the thing to do", and a deletion is
 * never that.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'danger' | 'neutral'
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}) {
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={title} description={description}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={confirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
