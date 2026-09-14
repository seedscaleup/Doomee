'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { authClient } from '@/lib/auth/client'

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot')
  const locale = useLocale()
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const form = new FormData(event.currentTarget)
    await authClient.requestPasswordReset({
      email: String(form.get('email')),
      redirectTo: `/${locale}/reset-password`,
    })

    setPending(false)
    // Always the same answer, sent or not: a different message would reveal
    // whether an address has an account.
    setSent(true)
  }

  if (sent) return <Alert tone="success">{t('sent')}</Alert>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={t('title')}>
        {({ id }) => <TextInput id={id} name="email" type="email" autoComplete="email" required />}
      </Field>
      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  )
}
