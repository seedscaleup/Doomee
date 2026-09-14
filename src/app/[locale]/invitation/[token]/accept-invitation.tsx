'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { acceptInvitation } from '@/modules/members/mutations'

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations('invitation')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [accepted, setAccepted] = useState(false)

  async function onAccept() {
    setError(null)
    setPending(true)
    try {
      const result = await acceptInvitation(token)
      // A client contact has no internal workspace to be sent to: their access
      // is to their own account, through the portal (LOT 9). Confirming it here
      // beats pushing them at a door that is not theirs.
      if (result.kind === 'client') setAccepted(true)
      else router.push('/app')
    } catch {
      setError(t('invalid'))
      setPending(false)
    }
  }

  if (accepted) return <Alert tone="success">{t('clientAccepted')}</Alert>

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button onClick={onAccept} disabled={pending}>
        {t('accept')}
      </Button>
    </div>
  )
}
