'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, TextInput } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import { signUp } from '@/lib/auth/client'

export function SignUpForm() {
  const t = useTranslations('auth.signUp')
  const locale = useLocale()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))

    const result = await signUp.email({
      name: String(form.get('name')),
      email,
      password: String(form.get('password')),
      // The language they signed up in is the language they get. Smart default,
      // changeable in settings.
      locale,
    })

    setPending(false)
    if (result.error) {
      setError(t('failed'))
      return
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label={t('name')}>
        {({ id }) => <TextInput id={id} name="name" autoComplete="name" required />}
      </Field>

      <Field label={t('email')}>
        {({ id }) => <TextInput id={id} name="email" type="email" autoComplete="email" required />}
      </Field>

      <Field label={t('password')} hint={t('passwordHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            aria-describedby={describedBy}
            required
          />
        )}
      </Field>

      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>

      <p className="text-sm text-muted">
        {t('hasAccount')}{' '}
        <Link
          href="/sign-in"
          className="font-medium text-doomee-black underline underline-offset-4"
        >
          {t('signInLink')}
        </Link>
      </p>
    </form>
  )
}
