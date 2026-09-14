import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/server'
import { AcceptInvitation } from './accept-invitation'

export default async function InvitationPage(props: {
  params: Promise<{ locale: string; token: string }>
}) {
  const { locale, token } = await props.params
  const session = await getSession()
  const t = await getTranslations('invitation')

  // Accepting binds the invitation to an account, so there has to be one first.
  if (!session) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/invitation/${token}`)}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{t('title', { organization: 'doomee' })}</h1>
      <p className="text-sm text-muted">{t('body')}</p>
      <AcceptInvitation token={token} />
    </main>
  )
}
