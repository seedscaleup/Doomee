'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { Alert, Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { removeClientLogo, uploadClientLogo } from '@/modules/clients/mutations'
// The pure rules, not the barrel: the barrel is a server entrypoint (ADR-030).
import { inspectLogo } from '@/modules/files/service'

/**
 * The client's logo: shown, replaced, removed.
 *
 * The <img> src is a SIGNED URL that expires in five minutes (R13), minted on
 * the server after the permission check. It is not a public address, and a page
 * left open long enough will simply re-fetch it on the next render.
 */
export function LogoPanel({
  clientId,
  name,
  logoUrl,
}: {
  clientId: string
  name: string
  logoUrl: string | null
}) {
  const t = useTranslations('clients.logo')
  const tErrors = useTranslations('errors')
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
      /**
       * The SAME pure check the server runs, run here first — so the reader is
       * told which rule the file broke (too large, wrong format) instead of a
       * generic failure. It is not a substitute for the server's check, which
       * still runs and still decides: this one is only about saying something
       * useful, and about not sending two megabytes to be refused.
       */
      const verdict = inspectLogo(new Uint8Array(await file.arrayBuffer()))
      if (!verdict.ok) {
        setError(tErrors(`upload_${verdict.reason}`))
        return
      }

      await uploadClientLogo({ clientId, file })
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
      // Let the same file be picked again after a failure.
      if (input.current) input.current.value = ''
    }
  }

  async function onRemove() {
    setError(null)
    setPending(true)
    try {
      await removeClientLogo({ clientId })
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // biome-ignore lint/performance/noImgElement: a signed, expiring URL is not a static asset next/image can optimise
          <img
            src={logoUrl}
            alt={t('alt', { name })}
            className="size-16 rounded-doomee border border-border object-contain"
          />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-doomee border border-dashed border-border text-caption text-subtle">
            {t('none')}
          </span>
        )}

        <div className="flex flex-col gap-1">
          <label className="flex min-h-touch w-fit cursor-pointer items-center rounded-doomee border border-border px-4 text-label font-semibold">
            {t('change')}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={pending}
              onChange={onChoose}
            />
          </label>
          <span className="text-caption text-subtle">{t('hint')}</span>
        </div>

        {logoUrl ? (
          <Button variant="ghost" onClick={onRemove} disabled={pending}>
            {t('remove')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
