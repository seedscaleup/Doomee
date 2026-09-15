'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { EmptyState } from '@/components/patterns'
import { Alert } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { attachToAction } from '@/modules/actions/mutations'
import type { AttachmentRow } from '@/modules/actions/types'
// The pure rules, not the barrel: the barrel is a server entrypoint (ADR-030).
import { inspectAttachment } from '@/modules/files/service'

/**
 * Files hung on an action.
 *
 * Each link is signed and expires in five minutes (R13, ADR-037) — minted on
 * the server after the permission check, and re-minted on the next render.
 */
export function AttachmentsPanel({
  actionId,
  attachments,
  canEdit,
}: {
  actionId: string
  attachments: AttachmentRow[]
  canEdit: boolean
}) {
  const t = useTranslations('actions.attachments')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setPending(true)
    try {
      // The SAME pure check the server runs, run here first, so the reader is
      // told which rule the file broke rather than getting a generic failure.
      // It does not replace the server's check, which still decides.
      const verdict = inspectAttachment(new Uint8Array(await file.arrayBuffer()))
      if (!verdict.ok) {
        setError(tErrors(`upload_${verdict.reason}`))
        return
      }

      await attachToAction({ actionId, file })
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canEdit ? (
        <div className="flex flex-col gap-1">
          <label className="flex min-h-touch w-fit cursor-pointer items-center rounded-doomee border border-border px-4 text-label font-semibold">
            {t('add')}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              disabled={pending}
              onChange={onChoose}
            />
          </label>
          <span className="text-caption text-subtle">{t('hint')}</span>
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{attachment.filename}</span>
                {/* Intl knows how a size is written in each language; a hand
                    rolled "kB" is a hard-coded string and a wrong one in some. */}
                <span className="text-caption text-muted">
                  {format.number(Math.ceil(attachment.sizeBytes / 1024), {
                    style: 'unit',
                    unit: 'kilobyte',
                    unitDisplay: 'short',
                  })}
                </span>
              </span>
              <a
                href={attachment.url}
                className="ml-auto flex min-h-touch items-center text-label underline underline-offset-4"
                rel="noreferrer"
                target="_blank"
              >
                {t('open')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
