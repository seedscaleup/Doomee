'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
// A client component imports the exact files it needs: the module barrel is
// a server entrypoint and would drag next/headers into the browser bundle.
import { createOrganization } from '@/modules/organizations/mutations'
import { slugify } from '@/modules/organizations/service'

const CURRENCIES = ['XOF', 'EUR', 'USD'] as const

export function OnboardingForm() {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const [name, setName] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Smart default (UX principle 4): the identifier writes itself until the
  // person decides otherwise. Less typing, no extra decision.
  function onNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    try {
      await createOrganization({
        name,
        slug,
        defaultLocale: locale === 'en' ? 'en' : 'fr',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        defaultCurrency: String(form.get('currency')),
      })
      router.push('/app')
    } catch {
      setError(t('failed'))
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label={t('name')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            minLength={2}
          />
        )}
      </Field>

      <Field label={t('slug')} hint={t('slugHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="slug"
            value={slug}
            aria-describedby={describedBy}
            onChange={(event) => {
              setSlugTouched(true)
              setSlug(event.target.value)
            }}
            required
            minLength={3}
          />
        )}
      </Field>

      <Field label={t('currency')}>
        {({ id }) => (
          <Select id={id} name="currency" defaultValue="XOF">
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button type="submit" disabled={pending || name.length < 2}>
        {pending ? tCommon('loading') : t('submit')}
      </Button>
    </form>
  )
}
