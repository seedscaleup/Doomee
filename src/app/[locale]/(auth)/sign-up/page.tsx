import { getTranslations } from 'next-intl/server'
import { SignUpForm } from './sign-up-form'

export default async function SignUpPage() {
  const t = await getTranslations('auth.signUp')

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle')}</p>
      </div>
      <SignUpForm />
    </section>
  )
}
