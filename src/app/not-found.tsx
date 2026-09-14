import { DEFAULT_LOCALE } from '@/i18n/routing'
import '@/styles/globals.css'

/**
 * Global fallback for paths that carry no locale at all. Locale-aware 404s are
 * handled by [locale]/not-found.tsx; this one cannot know the reader's
 * language, so it stays wordless and points back to the default locale.
 */
export default function GlobalNotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="flex min-h-dvh items-center justify-center bg-background">
        <a
          href={`/${DEFAULT_LOCALE}`}
          className="rounded-[--radius-doomee] bg-doomee-yellow px-4 py-2.5 text-sm font-semibold text-doomee-black"
        >
          {/* i18n-exempt: brand name, identical in every language, and this
              route has no locale context to translate from. */}
          doomee
        </a>
      </body>
    </html>
  )
}
