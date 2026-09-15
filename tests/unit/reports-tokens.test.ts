import { describe, expect, it } from 'vitest'
import {
  generateShareToken,
  hashSharePassword,
  hashShareToken,
  verifySharePassword,
} from '@/modules/reports/tokens'

describe('share tokens', () => {
  it('generates a long, URL-safe, unguessable token', () => {
    const token = generateShareToken()

    // 32 bytes of base64url.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // No padding, no slash, no plus: it has to survive an e-mail client.
    expect(token).not.toContain('=')
    expect(token).not.toContain('/')
    expect(token).not.toContain('+')
  })

  it('never generates the same token twice', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateShareToken()))
    expect(tokens.size).toBe(200)
  })

  /** A leaked database must not hand out live links. */
  it('hashes a token deterministically and irreversibly', () => {
    const token = generateShareToken()

    expect(hashShareToken(token)).toBe(hashShareToken(token))
    expect(hashShareToken(token)).not.toContain(token)
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('gives two tokens two different hashes', () => {
    expect(hashShareToken(generateShareToken())).not.toBe(hashShareToken(generateShareToken()))
  })
})

describe('the optional share password', () => {
  it('accepts the right password', async () => {
    const stored = await hashSharePassword('un-mot-de-passe')
    expect(await verifySharePassword('un-mot-de-passe', stored)).toBe(true)
  })

  it('refuses the wrong one', async () => {
    const stored = await hashSharePassword('un-mot-de-passe')
    expect(await verifySharePassword('un-autre', stored)).toBe(false)
    expect(await verifySharePassword('', stored)).toBe(false)
  })

  /** Salted: the same password twice must not produce the same stored value. */
  it('salts every hash', async () => {
    const a = await hashSharePassword('identique')
    const b = await hashSharePassword('identique')

    expect(a).not.toBe(b)
    expect(await verifySharePassword('identique', a)).toBe(true)
    expect(await verifySharePassword('identique', b)).toBe(true)
  })

  it('carries its scheme, so the parameters can be raised later', async () => {
    expect(await hashSharePassword('x')).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
  })

  /** A visitor gets a refusal, never a stack trace. */
  it.each(['', 'garbage', 'scrypt$', 'scrypt$nothex$nothex', 'bcrypt$aa$bb'])(
    'refuses a malformed stored value (%s) rather than throwing',
    async (stored) => {
      await expect(verifySharePassword('anything', stored)).resolves.toBe(false)
    },
  )

  /** Unicode normalisation, so a password typed on two keyboards still matches. */
  it('normalises the password before hashing', async () => {
    const stored = await hashSharePassword('été')
    expect(await verifySharePassword('été'.normalize('NFC'), stored)).toBe(true)
  })
})

/**
 * Each guard, reached on purpose. A share page must answer "wrong password" to
 * a malformed row, never a 500 — and there is no catch-all behind these, so
 * each one is the only thing standing between a bad row and a crash.
 */
describe('verifySharePassword — every refusal path', () => {
  it('refuses an unknown scheme', async () => {
    await expect(verifySharePassword('secret', 'bcrypt$aabb$ccdd')).resolves.toBe(false)
    await expect(verifySharePassword('secret', '')).resolves.toBe(false)
  })

  it('refuses a missing salt or hash', async () => {
    await expect(verifySharePassword('secret', 'scrypt$')).resolves.toBe(false)
    await expect(verifySharePassword('secret', 'scrypt$aabb$')).resolves.toBe(false)
    await expect(verifySharePassword('secret', 'scrypt$$aabb')).resolves.toBe(false)
  })

  it('refuses hex that is not hex, or would silently truncate', async () => {
    await expect(verifySharePassword('secret', 'scrypt$zz$zz')).resolves.toBe(false)
    // Odd length: Buffer.from would drop the last nibble without complaining.
    await expect(verifySharePassword('secret', 'scrypt$aabb$abc')).resolves.toBe(false)
  })

  it('refuses a hash of the wrong length even when it is valid hex', async () => {
    await expect(verifySharePassword('secret', 'scrypt$aabb$aabb')).resolves.toBe(false)
  })
})
