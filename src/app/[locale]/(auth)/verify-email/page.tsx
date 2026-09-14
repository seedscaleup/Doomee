import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function VerifyEmailPage(props: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await props.searchParams
  const t = await getTranslations('auth.verify')

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted">{t('body', { email: email ?? '' })}</p>
      <Link href="/sign-in" className="text-sm underline underline-offset-4">
        {t('backToSignIn')}
      </Link>
    </section>
  )
}
