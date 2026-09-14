import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, LOCALES } from '@/i18n/routing'
import '@/styles/globals.css'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'app' })

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('promise'),
  }
}

export default async function LocaleLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  setRequestLocale(locale)

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-background text-doomee-black antialiased">
        <NextIntlClientProvider>{props.children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
