/**
 * Development-only pages: the token sheet and the component gallery.
 *
 * Gated on an explicit flag rather than NODE_ENV alone, because the end-to-end
 * suite runs a PRODUCTION build. With a NODE_ENV check these pages 404 there,
 * and the accessibility scan happily passes — on the 404 page. A test that
 * passes for the wrong reason is worse than no test.
 *
 * Production never sets the flag, so the pages stay absent where they belong.
 */
export function devPagesEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.ENABLE_DEV_PAGES === 'true') return true
  return env.NODE_ENV !== 'production'
}
