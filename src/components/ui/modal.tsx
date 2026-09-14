'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Modals are built on the native <dialog> element (ADR-031).
 *
 * showModal() gives focus trapping, Escape to close, inert background content
 * and the top layer for free — the four things a hand-rolled modal gets wrong.
 * It also means no dialog library in the bundle, which matters on the phone.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  variant = 'center',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  /** A sheet slides from the bottom on phones: closer to the thumb. */
  variant?: 'center' | 'sheet'
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click closes it; Escape does the same, natively
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
      // Escape and backdrop dismissal both route through the same handler, so
      // the parent's state can never disagree with what is on screen.
      onClose={onClose}
      // Clicking the backdrop closes it. The keyboard equivalent is Escape,
      // which <dialog> handles natively and routes through onClose above — so
      // the interaction is not mouse-only, despite how this line reads.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'w-full border border-border bg-surface p-0 text-doomee-black shadow-doomee-lifted backdrop:bg-doomee-black/35',
        variant === 'sheet'
          ? 'mt-auto mb-0 max-w-none rounded-t-doomee-lg sm:m-auto sm:max-w-lg sm:rounded-doomee-lg'
          : 'm-auto max-w-md rounded-doomee-lg',
      )}
    >
      <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex flex-col gap-1">
          <h2 id="modal-title" className="text-section">
            {title}
          </h2>
          {description ? (
            <p id="modal-description" className="text-label text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  )
}
