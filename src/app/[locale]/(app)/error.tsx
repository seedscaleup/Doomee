'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/field'

/**
 * The last line of defence for the workspace.
 *
 * It shows a translated message and never the underlying error: a driver
 * message can name tables and columns. The real cause is already in the server
 * log, keyed by the digest shown here so support can find it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  const tCommon = useTranslations('common')

  useEffect(() => {
    console.error(error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-title">{t('internal')}</h1>
      {error.digest ? <p className="text-caption text-subtle">{error.digest}</p> : null}
      <Button onClick={reset}>{tCommon('retry')}</Button>
    </div>
  )
}
