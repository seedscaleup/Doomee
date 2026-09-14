import { getTranslations } from 'next-intl/server'
import { SignInForm } from './sign-in-form'

export default async function SignInPage() {
  const t = await getTranslations('auth.signIn')

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle')}</p>
      </div>
      <SignInForm />
    </section>
  )
}
