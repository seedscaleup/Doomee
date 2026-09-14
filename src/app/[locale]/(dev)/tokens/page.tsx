import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@/i18n/routing'
import { devPagesEnabled } from '@/lib/dev-pages'

/**
 * Visual review of the design tokens (D4). Development only — this route is
 * not reachable in production builds.
 */
const TOKENS = [
  { key: 'yellow', cssVar: '--color-doomee-yellow', value: '#FFD21F', swatch: 'bg-doomee-yellow' },
  { key: 'black', cssVar: '--color-doomee-black', value: '#111111', swatch: 'bg-doomee-black' },
  { key: 'background', cssVar: '--color-background', value: '#FAFAF7', swatch: 'bg-background' },
  { key: 'surface', cssVar: '--color-surface', value: '#FFFFFF', swatch: 'bg-surface' },
  { key: 'border', cssVar: '--color-border', value: '#E8E8E3', swatch: 'bg-border' },
  { key: 'success', cssVar: '--color-success', value: '#22A06B', swatch: 'bg-success' },
  { key: 'danger', cssVar: '--color-danger', value: '#E5484D', swatch: 'bg-danger' },
  { key: 'warning', cssVar: '--color-warning', value: '#F59E0B', swatch: 'bg-warning' },
] as const

/**
 * Rendered per request, not prerendered: the gate below reads the environment,
 * and a statically generated page would bake in the answer from build time —
 * which is how the accessibility scan ended up scanning a 404.
 */
export const dynamic = 'force-dynamic'

export default async function DesignTokensPage(props: { params: Promise<{ locale: string }> }) {
  if (!devPagesEnabled(process.env)) notFound()

  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  setRequestLocale(locale)
  const t = await getTranslations('devTokens')

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('description')}</p>

      <ul className="mt-8 flex flex-col gap-3">
        {TOKENS.map((token) => (
          <li
            key={token.key}
            className="flex items-center gap-4 rounded-[--radius-doomee] border border-border bg-surface p-3"
          >
            <span
              aria-hidden="true"
              className={`size-11 shrink-0 rounded-[--radius-doomee] border border-border ${token.swatch}`}
            />
            <span className="flex min-w-0 flex-col">
              <code className="text-sm font-semibold">{token.cssVar}</code>
              <span className="text-sm text-muted">{t(`tokens.${token.key}`)}</span>
            </span>
            <code className="ml-auto shrink-0 text-xs text-muted">{token.value}</code>
          </li>
        ))}
      </ul>
    </main>
  )
}
