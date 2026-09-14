import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { listMembershipsForUser } from '@/modules/organizations'
import { getSession } from '@/server'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  const session = await getSession()
  if (!session) redirect(`/${locale}/sign-in`)

  // Already in a team? Onboarding has nothing to ask.
  const existing = await listMembershipsForUser(session.userId)
  if (existing.length > 0) redirect(`/${locale}/app`)

  const t = await getTranslations('onboarding')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle')}</p>
      </div>
      <OnboardingForm />
    </main>
  )
}
