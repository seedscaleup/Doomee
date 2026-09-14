import { getTranslations } from 'next-intl/server'
import { getProfile } from '@/modules/settings'
import { requirePageSession } from '@/server'
import { ProfileForm } from './profile-form'

export default async function SettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)

  const t = await getTranslations('settings')
  const profile = await getProfile()

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <ProfileForm profile={profile} />
    </section>
  )
}
