import { describe, expect, it } from 'vitest'
import { parseServerEnv } from '@/lib/env'

const VALID = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://doomee_app:secret@localhost:5432/doomee',
  DATABASE_AUTH_URL: 'postgres://doomee:doomee@localhost:5432/doomee',
  AUTH_SECRET: 'a-test-secret-that-is-at-least-32-characters-long',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'eu-west-1',
  S3_BUCKET: 'doomee-local',
  S3_ACCESS_KEY_ID: 'doomee',
  S3_SECRET_ACCESS_KEY: 'doomee-secret',
} satisfies NodeJS.ProcessEnv

describe('server environment', () => {
  it('accepts a complete configuration', () => {
    const env = parseServerEnv(VALID)
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL)
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('fails fast when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...incomplete } = VALID
    expect(() => parseServerEnv(incomplete)).toThrow(/DATABASE_URL/)
  })

  it('rejects a malformed endpoint rather than failing later at runtime', () => {
    expect(() => parseServerEnv({ ...VALID, S3_ENDPOINT: 'not-a-url' })).toThrow(/S3_ENDPOINT/)
  })

  it('refuses a short AUTH_SECRET rather than signing sessions weakly', () => {
    expect(() => parseServerEnv({ ...VALID, AUTH_SECRET: 'too-short' })).toThrow(/AUTH_SECRET/)
  })

  it('requires the auth connection separately from the application one', () => {
    // They are different roles on purpose: app_user is subject to RLS, the auth
    // role is not. Collapsing them would silently widen the application's reach.
    const { DATABASE_AUTH_URL: _omitted, ...incomplete } = VALID
    expect(() => parseServerEnv(incomplete)).toThrow(/DATABASE_AUTH_URL/)
  })

  it('treats SENTRY_DSN as optional (D8)', () => {
    expect(parseServerEnv(VALID).SENTRY_DSN).toBeUndefined()
  })
})
