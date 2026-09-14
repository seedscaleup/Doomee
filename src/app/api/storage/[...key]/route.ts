import { serverEnv } from '@/lib/env'
import { isSafeStorageKey, storage, verifyStorageLink } from '@/lib/storage'

/**
 * Serves an object stored by the FILESYSTEM adapter.
 *
 * With a bucket configured, signed URLs point at the bucket and this route is
 * never called. It exists so that the local adapter is a real implementation
 * and not a stub — same contract, same expiry, same "no public access".
 *
 * The signature is the authorisation here, exactly as a presigned bucket URL
 * carries its own: the permission check happened when the link was minted, and
 * the link is short-lived (R13). This route re-checks the signature and the
 * expiry, and nothing else.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Types that may be rendered in place. Everything else is handed over as a
 * download, so a file that turns out to be a document cannot execute in our
 * origin. SVG is not on this list and must not be: it can carry script.
 */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await context.params
  const key = segments.join('/')
  const url = new URL(request.url)

  if (!isSafeStorageKey(key)) return new Response(null, { status: 404 })

  const valid = verifyStorageLink({
    key,
    expiresAt: Number(url.searchParams.get('expires')),
    signature: url.searchParams.get('signature') ?? '',
    secret: serverEnv().AUTH_SECRET,
    now: Date.now(),
  })

  // 404 rather than 403, for the same reason everywhere else: a different
  // answer for "exists but expired" would confirm that the object exists.
  if (!valid) return new Response(null, { status: 404 })

  const bytes = await storage().get(key)
  if (!bytes) return new Response(null, { status: 404 })

  const contentType = contentTypeFor(key)

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      // The browser must not second-guess the type we declare.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': INLINE_TYPES.has(contentType) ? 'inline' : 'attachment',
      // The link already expires; caching it beyond that would outlive it.
      'Cache-Control': 'private, no-store',
    },
  })
}

/**
 * The extension in an OPAQUE key we minted ourselves, not a user-supplied
 * filename: the type was decided by reading the bytes at upload time, and the
 * key was named after that decision.
 */
function contentTypeFor(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()

  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'

  return 'application/octet-stream'
}
