import type { Metadata } from 'next'
import type { Locale } from '@/i18n/routing'
import { formatDateLong } from '@/lib/format'
import { lookupMessage } from '@/lib/i18n/translator'
import {
  preferencesFor,
  presentSection,
  recordShareView,
  resolveLabels,
  resolveShare,
} from '@/modules/reports'
import { BlocksView } from '@/modules/reports/components/blocks-view'
import '@/styles/globals.css'

/**
 * ============================================================================
 * THE SHARE PAGE — the only page in the product with no session.
 *
 * Four things make that safe, and all four are visible in this file:
 *
 *  1. the TOKEN is the authorisation, and it names its own organisation —
 *     nothing is taken from the URL but the token itself;
 *  2. what is shown is the SNAPSHOT (ADR-014), so it cannot drift from what
 *     the client was sent, and it touches no live table;
 *  3. only sections marked included AND client-visible AND not internal reach
 *     it — `sharedSections`, applied in `resolveShare`;
 *  4. `noindex`, so a forwarded link never becomes a search result.
 *
 * It renders in the REPORT's language, not the reader's browser's (ADR-011).
 * ============================================================================
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // A report is a private document handed to one client. It must never be
  // crawled, cached by a search engine, or previewed by a link unfurler.
  robots: { index: false, follow: false, nocache: true },
}

export default async function SharePage(props: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ password?: string }>
}) {
  const { token } = await props.params
  const { password } = await props.searchParams

  const resolution = await resolveShare(token, typeof password === 'string' ? password : null)

  if (!resolution.ok) {
    return <Refusal reason={resolution.reason} token={token} />
  }

  // Counted after the decision to show it, never before: a refused attempt is
  // not a consultation. Failures here never block the page.
  await recordShareView(token, resolution.shareId)

  const { report } = resolution
  const locale: Locale = report.locale
  const preferences = preferencesFor(locale, 'UTC')
  const translate = (key: string) =>
    lookupMessage(locale, keyOf(key)) ?? key.split('.').at(-1) ?? key

  return (
    <Shell locale={locale}>
      <header className="flex flex-col gap-2">
        <p className="text-caption uppercase tracking-wide text-muted">{report.organizationName}</p>
        <h1 className="text-display font-bold">{report.title}</h1>
        {/* The single yellow element on the page (CLAUDE.md §9). */}
        <div className="h-1 w-14 rounded-full bg-doomee-yellow" />
        <p className="text-label text-muted">
          {formatDateLong(dayOf(report.periodStart), preferences)} —{' '}
          {formatDateLong(dayOf(report.periodEnd), preferences)}
        </p>
        {report.publishedAt ? (
          <p className="text-caption text-muted">
            {translate('reports.pdf.publishedOn').replace(
              '{date}',
              formatDateLong(dayOf(report.publishedAt), preferences),
            )}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-8">
        {report.sections.map((section) => {
          const blocks = presentSection(section.key, section.data, preferences)

          return (
            <section key={section.key} className="flex flex-col gap-3">
              <h2 className="text-section font-semibold">
                {section.title ?? translate(`reports.sections.${section.key}`)}
              </h2>
              {section.body ? <p className="whitespace-pre-line">{section.body}</p> : null}
              <BlocksView
                blocks={blocks}
                emptyLabel={translate('reports.pdf.noData')}
                labels={resolveLabels(locale, blocks)}
              />
            </section>
          )
        })}
      </div>

      <footer className="border-border border-t pt-4 text-caption text-muted">
        {translate('reports.public.footer')}
      </footer>
    </Shell>
  )
}

/**
 * A refusal says WHICH refusal (ADR-041).
 *
 * "Expired", "revoked" and "not found" send a person to three different next
 * steps, and collapsing them into one message would leave them re-clicking a
 * link that will never work.
 *
 * The one it does not distinguish is the organisation: nothing here names the
 * agency, the client or the report, because a refusal is reached by anyone
 * holding a guess at a URL.
 */
function Refusal({
  reason,
  token,
}: {
  reason: 'not_found' | 'revoked' | 'expired' | 'password_required' | 'password_wrong'
  token: string
}) {
  // The reader has no session and therefore no language of their own. French
  // is the product's default (DEFAULT_LOCALE) and the honest choice here.
  const locale: Locale = 'fr'
  const text = (key: string) => lookupMessage(locale, `reports.public.${key}`) ?? key

  if (reason === 'password_required' || reason === 'password_wrong') {
    return (
      <Shell locale={locale}>
        <h1 className="text-title font-bold">{text('passwordTitle')}</h1>
        <p className="text-muted">{text('passwordDescription')}</p>
        {reason === 'password_wrong' ? (
          <p role="alert" className="text-danger-text">
            {text('wrongPassword')}
          </p>
        ) : null}

        {/*
          A GET form, deliberately: this page has no session and therefore no
          CSRF token, and a password in a query string is at least a password
          the reader can see they are sending. It is a one-shot gate on an
          already-secret URL, not a credential of record — which is why it is
          optional and why the link expires regardless.
        */}
        <form method="get" action={`/share/${encodeURIComponent(token)}`} className="flex gap-2">
          <input
            type="password"
            name="password"
            required
            minLength={1}
            aria-label={text('password')}
            className="min-h-touch w-full rounded-doomee border border-border bg-surface px-3 text-base"
          />
          <button
            type="submit"
            className="min-h-touch shrink-0 rounded-doomee bg-doomee-yellow px-4 font-semibold text-doomee-black"
          >
            {text('open')}
          </button>
        </form>
      </Shell>
    )
  }

  const key = reason === 'expired' ? 'expired' : reason === 'revoked' ? 'revoked' : 'notFound'

  return (
    <Shell locale={locale}>
      <h1 className="text-title font-bold">{text(`${key}Title`)}</h1>
      <p className="text-muted">{text(`${key}Description`)}</p>
    </Shell>
  )
}

/**
 * Its own shell, because this page is outside the localised tree: the `lang`
 * attribute is the REPORT's language, and there is no navigation, no session
 * and nothing to click away to.
 */
function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-background text-doomee-black antialiased">
        <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">{children}</main>
      </body>
    </html>
  )
}

function keyOf(key: string): string {
  return key.includes('.') ? key : `reports.fields.${key}`
}

function dayOf(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`)
}
