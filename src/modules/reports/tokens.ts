import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

/**
 * ============================================================================
 * SHARE TOKENS — the credentials of the one unauthenticated surface.
 *
 * A share link is a bearer credential: whoever holds the URL is the reader. So
 * the token is treated exactly as a password would be.
 * ============================================================================
 */

/** 32 bytes from the CSPRNG. Base64url, so it survives an e-mail client. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * The token is stored HASHED, never in clear.
 *
 * SHA-256 and not scrypt, deliberately: the token is 256 bits of CSPRNG
 * output, so it has no dictionary to attack and stretching buys nothing. What
 * stretching WOULD cost is a lookup per row on every page view, since the hash
 * is the index we find the share by.
 *
 * A leaked database must not hand out live links — that is what this achieves,
 * and it is the reason `token_hash` and not `token` is the column.
 */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * The optional password IS stretched: it is human-chosen, so it has a
 * dictionary. scrypt with a per-password salt, and the parameters stored with
 * the hash so they can be raised later without invalidating anything.
 */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scryptAsync(password.normalize('NFKC'), salt, 64)) as Buffer
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Compared in CONSTANT TIME.
 *
 * A byte-by-byte comparison leaks how much of the password was right, one
 * request at a time. `timingSafeEqual` is the whole reason this function
 * exists rather than an `===`.
 */
export async function verifySharePassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')

  /**
   * Every malformed stored value is refused HERE, by a check a test can reach.
   *
   * There was a `try { … } catch { return false }` around the rest of this
   * function until a probe showed that `scrypt`, with the fixed parameters
   * above, does not throw for any input — not an empty salt, not a five-megabyte
   * password, not a hundred-megabyte salt. So the catch was a line that
   * reassured without ever running, which CLAUDE.md §13 says to delete or to
   * make a test execute. The three guards below are the complete set, and each
   * one has its own test.
   */
  if (scheme !== 'scrypt' || !isHex(saltHex) || !isHex(hashHex)) return false

  const derived = (await scryptAsync(
    password.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    64,
  )) as Buffer
  const expected = Buffer.from(hashHex, 'hex')

  // Lengths must match before timingSafeEqual, which throws otherwise. The
  // length of a hash is not a secret, so this leaks nothing.
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

/** Even-length hexadecimal, so `Buffer.from(…, 'hex')` cannot silently truncate. */
function isHex(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 2 === 0 &&
    /^[0-9a-f]+$/i.test(value)
  )
}
