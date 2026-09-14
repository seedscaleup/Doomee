import { getTranslations } from 'next-intl/server'

export default async function AppHomePage() {
  const t = await getTranslations('home')
  const tNav = await getTranslations('nav')

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{tNav('home')}</h1>
      <p className="max-w-prose text-muted">{t('description')}</p>
    </section>
  )
}
