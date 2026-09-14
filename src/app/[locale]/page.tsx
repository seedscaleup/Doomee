import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@/i18n/routing'

const LOOP_STEPS = [
  'objective',
  'action',
  'deliverable',
  'result',
  'analysis',
  'insight',
  'recommendation',
  'nextAction',
] as const

export default async function HomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  setRequestLocale(locale)
  const t = await getTranslations('home')
  const tApp = await getTranslations('app')

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-4 py-16">
      <header className="flex flex-col gap-4">
        <span className="w-fit rounded-full bg-doomee-yellow px-3 py-1 text-xs font-semibold tracking-wide text-doomee-black uppercase">
          {t('badge')}
        </span>
        <p className="text-sm font-medium text-muted">{tApp('tagline')}</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{t('title')}</h1>
        <p className="max-w-prose text-base text-muted sm:text-lg">{t('description')}</p>
      </header>

      <section
        aria-labelledby="loop-title"
        className="rounded-[--radius-doomee] border border-border bg-surface p-5 sm:p-6"
      >
        <h2 id="loop-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('loopTitle')}
        </h2>
        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-3">
          {LOOP_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-[--radius-doomee] border border-border px-3 py-1.5 text-sm font-medium">
                {t(`loop.${step}`)}
              </span>
              {index < LOOP_STEPS.length - 1 ? (
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
