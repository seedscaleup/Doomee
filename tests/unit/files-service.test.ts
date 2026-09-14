import { describe, expect, it } from 'vitest'
import { isSafeStorageKey, storageKey } from '@/lib/storage/keys'
import { signStorageLink, verifyStorageLink } from '@/lib/storage/signature'
import { detectImageType, extensionFor, inspectLogo, MAX_LOGO_BYTES } from '@/modules/files/service'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

describe('what a file actually is', () => {
  it('reads the type from the signature, not the name', () => {
    expect(detectImageType(PNG)).toBe('image/png')
    expect(detectImageType(JPEG)).toBe('image/jpeg')
    expect(detectImageType(WEBP)).toBe('image/webp')
  })

  it('refuses an SVG however it is dressed up', () => {
    // An SVG is a document that can carry script. Serving one inline from our
    // own origin is stored XSS, so it never becomes a logo.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(detectImageType(svg)).toBeNull()
    expect(inspectLogo(svg)).toEqual({ ok: false, reason: 'unsupported_type' })
  })

  it('refuses a PNG name over other bytes', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    expect(inspectLogo(zip)).toEqual({ ok: false, reason: 'unsupported_type' })
  })

  it('refuses a truncated header rather than guessing', () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50]))).toBeNull()
    // RIFF without the WEBP marker is some other RIFF container.
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBeNull()
  })

  it('refuses an empty file and one over the ceiling', () => {
    expect(inspectLogo(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' })

    const huge = new Uint8Array(MAX_LOGO_BYTES + 1)
    huge.set(PNG.subarray(0, 8))
    expect(inspectLogo(huge)).toEqual({ ok: false, reason: 'too_large' })
  })

  it('accepts a file exactly at the ceiling', () => {
    const exact = new Uint8Array(MAX_LOGO_BYTES)
    exact.set(PNG.subarray(0, 8))
    expect(inspectLogo(exact)).toEqual({ ok: true, mimeType: 'image/png' })
  })

  it('names the extension after the detected type', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
  })
})

describe('storage keys', () => {
  it('prefixes with the tenant and hides the original name', () => {
    const key = storageKey({
      organizationId: '11111111-1111-7111-8111-111111111111',
      kind: 'client-logo',
      id: '22222222-2222-7222-8222-222222222222',
      extension: 'png',
    })

    expect(key).toBe(
      '11111111-1111-7111-8111-111111111111/client-logo/22222222-2222-7222-8222-222222222222.png',
    )
  })

  it.each([
    ['../../etc/passwd', 'climbs out'],
    ['/absolute', 'absolute'],
    ['a//b', 'empty segment'],
    ['a/../b', 'traversal in the middle'],
    ['a/b c', 'space'],
    ['a/b?x=1', 'query'],
    ['', 'empty'],
  ])('refuses %s (%s)', (key) => {
    expect(isSafeStorageKey(key)).toBe(false)
  })

  it('accepts the keys it mints itself', () => {
    expect(isSafeStorageKey('org/client-logo/file.png')).toBe(true)
  })
})

describe('the local signed link', () => {
  const secret = 'a-secret-that-is-at-least-32-characters-long'
  const key = 'org/client-logo/file.png'
  const now = 1_700_000_000_000
  const expiresAt = Math.floor(now / 1000) + 300

  it('accepts its own signature before it expires', () => {
    const signature = signStorageLink({ key, expiresAt, secret })
    expect(verifyStorageLink({ key, expiresAt, signature, secret, now })).toBe(true)
  })

  it('refuses it afterwards', () => {
    const signature = signStorageLink({ key, expiresAt, secret })
    const later = (expiresAt + 1) * 1000
    expect(verifyStorageLink({ key, expiresAt, signature, secret, now: later })).toBe(false)
  })

  it('refuses a signature moved to another key', () => {
    // The whole point: the signature covers the key, so a valid link to one
    // object is not a valid link to the next id along.
    const signature = signStorageLink({ key, expiresAt, secret })
    const other = 'org/client-logo/another.png'
    expect(verifyStorageLink({ key: other, expiresAt, signature, secret, now })).toBe(false)
  })

  it('refuses an expiry pushed forward by hand', () => {
    const signature = signStorageLink({ key, expiresAt, secret })
    const stretched = expiresAt + 86_400
    expect(verifyStorageLink({ key, expiresAt: stretched, signature, secret, now })).toBe(false)
  })

  it('refuses a signature made with another secret', () => {
    const signature = signStorageLink({ key, expiresAt, secret: 'another-secret-entirely-here' })
    expect(verifyStorageLink({ key, expiresAt, signature, secret, now })).toBe(false)
  })

  it('refuses garbage instead of throwing on it', () => {
    expect(verifyStorageLink({ key, expiresAt, signature: 'x', secret, now })).toBe(false)
    expect(verifyStorageLink({ key, expiresAt: Number.NaN, signature: 'x', secret, now })).toBe(
      false,
    )
  })
})
