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

  async function onAccept() {
    setError(null)
    setPending(true)
    try {
      const result = await acceptInvitation(token)
      // A client contact has no internal workspace: their door is the portal.
      // Sending them straight through it is the difference between "you now
      // have access" and actually having it.
      router.push(result.kind === 'client' ? '/portal' : '/app')
    } catch {
      setError(t('invalid'))
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button onClick={onAccept} disabled={pending}>
        {t('accept')}
      </Button>
    </div>
  )
}
