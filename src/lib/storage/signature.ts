import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The local adapter has no presigning service, so it borrows the same idea: a
 * link that carries its own expiry and a signature over it.
 *
 * Pure and dependency-free, so both the signing side and the serving route use
 * exactly the same rules — a signature scheme where the two sides are written
 * twice is a signature scheme with two bugs.
 */
export function signStorageLink(input: { key: string; expiresAt: number; secret: string }): string {
  return createHmac('sha256', input.secret)
    .update(`${input.key}:${input.expiresAt}`)
    .digest('base64url')
}

export function verifyStorageLink(input: {
  key: string
  expiresAt: number
  signature: string
  secret: string
  now: number
}): boolean {
  if (!Number.isFinite(input.expiresAt) || input.expiresAt * 1000 <= input.now) return false

  const expected = Buffer.from(
    signStorageLink({ key: input.key, expiresAt: input.expiresAt, secret: input.secret }),
  )
  const given = Buffer.from(input.signature)

  // Compare in constant time, and only once the lengths match: timingSafeEqual
  // throws on a length mismatch, which would itself be an oracle.
  return expected.length === given.length && timingSafeEqual(expected, given)
}
