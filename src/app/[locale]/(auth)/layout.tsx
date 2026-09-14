import { getTranslations } from 'next-intl/server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('app')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-2xl font-bold lowercase">{t('name')}</span>
        <span className="text-sm text-muted">{t('tagline')}</span>
      </header>
      {children}
    </main>
  )
}
