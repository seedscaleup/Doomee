import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@/i18n/routing'
import { devPagesEnabled } from '@/lib/dev-pages'
import { DesignGallery } from './design-gallery'

/**
 * Visual review of the whole vocabulary on one page.
 *
 * It exists so the yellow rule can be checked by eye — one dominant yellow
 * element per screen is not something a test can assert — and so a new
 * component is seen next to its siblings before it reaches a real screen.
 *
 * Development only: absent from production builds.
 */
/**
 * Rendered per request, not prerendered: the gate below reads the environment,
 * and a statically generated page would bake in the answer from build time —
 * which is how the accessibility scan ended up scanning a 404.
 */
export const dynamic = 'force-dynamic'

export default async function DesignPage(props: { params: Promise<{ locale: string }> }) {
  if (!devPagesEnabled(process.env)) notFound()

  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  setRequestLocale(locale)
  const t = await getTranslations('devDesign')

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-display">{t('title')}</h1>
        <p className="text-muted">{t('description')}</p>
      </header>
      <DesignGallery />
    </main>
  )
}
