'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import { signIn } from '@/lib/auth/client'

export function SignInForm() {
  const t = useTranslations('auth.signIn')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const result = await signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })

    setPending(false)
    // Never distinguish "unknown address" from "wrong password": that turns the
    // sign-in form into an account-enumeration oracle.
    if (result.error) {
      setError(t('failed'))
      return
    }
    router.push('/app')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label={t('email')}>
        {({ id }) => <TextInput id={id} name="email" type="email" autoComplete="email" required />}
      </Field>

      <Field label={t('password')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </Field>

      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>

      <div className="flex flex-col gap-2 text-sm text-muted">
        <Link href="/forgot-password" className="underline underline-offset-4">
          {t('forgot')}
        </Link>
        <span>
          {t('noAccount')}{' '}
          <Link
            href="/sign-up"
            className="font-medium text-doomee-black underline underline-offset-4"
          >
            {t('createAccount')}
          </Link>
        </span>
      </div>
    </form>
  )
}
