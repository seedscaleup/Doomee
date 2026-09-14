/**
 * Explicit rate limits for the authentication surface.
 *
 * Left to library defaults these are invisible, so they get discovered the day
 * a real user is blocked — or the day an attacker finds they were never tight
 * enough. Stated here, they are reviewable and testable.
 *
 * The numbers are per IP. They are deliberately generous enough for an office
 * behind a single NAT, and tight enough that credential stuffing is not free.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60
export const RATE_LIMIT_MAX_REQUESTS = 60

export const AUTH_RATE_LIMIT_RULES = {
  /** Sign-up is the expensive one: it creates a row and sends a mail. */
  '/sign-up/email': { window: 3600, max: 20 },
  /** Enough for a forgetful person, far short of credential stuffing. */
  '/sign-in/email': { window: 300, max: 15 },
  '/forget-password': { window: 3600, max: 5 },
  '/reset-password': { window: 3600, max: 10 },
  '/sign-in/magic-link': { window: 3600, max: 10 },
  '/verify-email': { window: 3600, max: 20 },
} as const

/**
 * End-to-end tests drive dozens of sign-ups from 127.0.0.1 in seconds, which
 * any honest limit would refuse. The switch is off by default and only ever
 * set by scripts/e2e.ts; production ignores it entirely.
 */
export function rateLimitEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV !== 'production') return false
  return env.AUTH_RATE_LIMIT_DISABLED !== 'true'
}
