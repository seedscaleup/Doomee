import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function LocaleNotFound() {
  const t = await getTranslations('notFound')

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="text-muted">{t('description')}</p>
      <Link
        href="/"
        className="mx-auto w-fit rounded-[--radius-doomee] bg-doomee-yellow px-4 py-2.5 text-sm font-semibold text-doomee-black"
      >
        {t('backHome')}
      </Link>
    </main>
  )
}
