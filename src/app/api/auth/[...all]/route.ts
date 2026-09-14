import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth/config'

/**
 * Better Auth's HTTP surface: sign-up, sign-in, verification, reset, magic
 * link, sign-out.
 *
 * Node runtime, never Edge (ADR-021) — it needs the PostgreSQL driver, and the
 * portability rule forbids depending on a hosting provider's edge runtime.
 *
 * auth() is resolved per request, not at module scope: building the app must
 * not require production secrets to exist.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).GET(request)
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).POST(request)
}
