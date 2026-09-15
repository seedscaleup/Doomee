import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

/**
 * D1 — This middleware does LOCALE ROUTING AND NOTHING ELSE.
 *
 * It must never read the session, the database, or resolve a tenant:
 *  - middleware-based authorisation is bypassable (CVE-2025-29927 class);
 *  - the edge runtime has no PostgreSQL driver.
 *
 * Authentication, tenant resolution and permissions live in the Node server
 * layer, behind defineQuery / defineAction (CLAUDE.md rule 4).
 */
export default createMiddleware(routing)

/**
 * `share` is excluded on purpose.
 *
 * A share link is read in the REPORT's language (ADR-011), which the token
 * decides and the URL does not know. Letting the locale middleware redirect
 * `/share/x` to `/fr/share/x` would put a contradiction in the address bar of
 * every English report an English client opens.
 */
export const config = {
  matcher: ['/((?!api|share|_next|_vercel|.*\\..*).*)'],
}
