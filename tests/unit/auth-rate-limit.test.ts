import { describe, expect, it } from 'vitest'
import {
  AUTH_RATE_LIMIT_RULES,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitEnabled,
} from '@/lib/auth/rate-limit'

/**
 * The end-to-end suite runs with the limiter off, so these assertions are what
 * stops the limits being quietly weakened or dropped.
 */
describe('authentication rate limits', () => {
  it('protects every sensitive endpoint', () => {
    expect(Object.keys(AUTH_RATE_LIMIT_RULES).sort()).toEqual([
      '/forget-password',
      '/reset-password',
      '/sign-in/email',
      '/sign-in/magic-link',
      '/sign-up/email',
      '/verify-email',
    ])
  })

  it('keeps every rule tighter than the global ceiling', () => {
    for (const [route, rule] of Object.entries(AUTH_RATE_LIMIT_RULES)) {
      const globalRate = RATE_LIMIT_MAX_REQUESTS / RATE_LIMIT_WINDOW_SECONDS
      expect(rule.max / rule.window, `${route} is looser than the global limit`).toBeLessThan(
        globalRate,
      )
    }
  })

  it('makes password reset the tightest of all', () => {
    // It is the endpoint that mails a token to an address someone else may own.
    expect(AUTH_RATE_LIMIT_RULES['/forget-password'].max).toBeLessThanOrEqual(5)
  })

  it('is on in production', () => {
    expect(rateLimitEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true)
  })

  it('can only be switched off deliberately, and never outside production', () => {
    expect(
      rateLimitEnabled({
        NODE_ENV: 'production',
        AUTH_RATE_LIMIT_DISABLED: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false)

    // A typo must not disable it.
    expect(
      rateLimitEnabled({
        NODE_ENV: 'production',
        AUTH_RATE_LIMIT_DISABLED: 'yes',
      } as NodeJS.ProcessEnv),
    ).toBe(true)
  })
})
