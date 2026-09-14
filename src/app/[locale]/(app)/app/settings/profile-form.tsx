'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { updateProfile } from '@/modules/settings/mutations'

type Profile = {
  name: string
  email: string
  locale: 'fr' | 'en'
  reportLocale: 'fr' | 'en'
  timezone: string
  dateFormat: string
}

const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'] as const

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations('settings.profile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setSaved(false)

    const form = new FormData(event.currentTarget)
    const locale = String(form.get('locale')) as 'fr' | 'en'

    await updateProfile({
      name: String(form.get('name')),
      locale,
      reportLocale: String(form.get('reportLocale')) as 'fr' | 'en',
      timezone: String(form.get('timezone')),
      dateFormat: String(form.get('dateFormat')) as (typeof DATE_FORMATS)[number],
    })

    setPending(false)
    setSaved(true)
    // The interface language changed, so the URL prefix has to follow.
    if (locale !== profile.locale) router.replace('/app/settings', { locale })
    else router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {saved ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('name')}>
        {({ id }) => <TextInput id={id} name="name" defaultValue={profile.name} required />}
      </Field>

      <Field label={t('email')}>
        {({ id }) => <TextInput id={id} defaultValue={profile.email} disabled readOnly />}
      </Field>

      <Field label={t('locale')}>
        {({ id }) => (
          <Select id={id} name="locale" defaultValue={profile.locale}>
            <option value="fr">{tCommon('french')}</option>
            <option value="en">{tCommon('english')}</option>
          </Select>
        )}
      </Field>

      {/* The point of ADR-011: work in one language, report in another. */}
      <Field label={t('reportLocale')} hint={t('reportLocaleHint')}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            name="reportLocale"
            defaultValue={profile.reportLocale}
            aria-describedby={describedBy}
          >
            <option value="fr">{tCommon('french')}</option>
            <option value="en">{tCommon('english')}</option>
          </Select>
        )}
      </Field>

      <Field label={t('timezone')}>
        {({ id }) => <TextInput id={id} name="timezone" defaultValue={profile.timezone} required />}
      </Field>

      <Field label={t('dateFormat')}>
        {({ id }) => (
          <Select id={id} name="dateFormat" defaultValue={profile.dateFormat}>
            {DATE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('loading') : t('save')}
      </Button>
    </form>
  )
}
