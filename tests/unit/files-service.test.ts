import { describe, expect, it } from 'vitest'
import { isSafeStorageKey, storageKey } from '@/lib/storage/keys'
import { signStorageLink, verifyStorageLink } from '@/lib/storage/signature'
import {
  detectImageType,
  extensionFor,
  inspectAttachment,
  inspectLogo,
  MAX_ATTACHMENT_BYTES,
  MAX_LOGO_BYTES,
} from '@/modules/files/service'

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

/**
 * ============================================================================
 * ATTACHMENTS — the same rule, one type wider.
 *
 * This is the function that stands between an upload and the product, so it is
 * tested on what it must REFUSE at least as much as on what it accepts
 * (ADR-037).
 * ============================================================================
 */
describe('inspecting an attachment', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

  it('accepts a PDF by its signature', () => {
    expect(inspectAttachment(PDF)).toEqual({ ok: true, mimeType: 'application/pdf' })
  })

  it('accepts the three raster formats a logo may be', () => {
    expect(inspectAttachment(PNG)).toEqual({ ok: true, mimeType: 'image/png' })
    expect(inspectAttachment(JPEG)).toEqual({ ok: true, mimeType: 'image/jpeg' })
    expect(inspectAttachment(WEBP)).toEqual({ ok: true, mimeType: 'image/webp' })
  })

  /**
   * The whole reason the bytes are read. A file named `invoice.pdf`, uploaded
   * with `Content-Type: application/pdf`, whose content is an SVG: serving that
   * inline from our own origin is stored XSS with extra steps.
   */
  it('refuses an SVG however it is dressed up', () => {
    const svg = new Uint8Array(
      [...'<svg xmlns="http://www.w3.org/2000/svg">'].map((c) => c.charCodeAt(0)),
    )
    expect(inspectAttachment(svg)).toEqual({ ok: false, reason: 'unsupported_type' })
  })

  it('refuses an empty file', () => {
    expect(inspectAttachment(new Uint8Array())).toEqual({ ok: false, reason: 'empty' })
  })

  it('refuses a file over 10 MB', () => {
    const tooBig = new Uint8Array(MAX_ATTACHMENT_BYTES + 1)
    tooBig.set(PDF)
    expect(inspectAttachment(tooBig)).toEqual({ ok: false, reason: 'too_large' })
  })

  /** Exactly at the limit is inside it: a boundary that is off by one is a bug. */
  it('accepts a file of exactly 10 MB', () => {
    const exact = new Uint8Array(MAX_ATTACHMENT_BYTES)
    exact.set(PDF)
    expect(inspectAttachment(exact)).toEqual({ ok: true, mimeType: 'application/pdf' })
  })

  /** Size is checked before the signature: cheapest refusal first. */
  it('refuses an oversized file without inspecting it', () => {
    expect(inspectAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('refuses bytes too short to carry any signature', () => {
    expect(inspectAttachment(new Uint8Array([0x25]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    })
  })

  it('names the file extension for every accepted type', () => {
    expect(extensionFor('application/pdf')).toBe('pdf')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/webp')).toBe('webp')
  })

  /** A RIFF container that is not WEBP — an AVI, say — is not an image. */
  it('refuses a RIFF container that is not WEBP', () => {
    const avi = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])
    expect(detectImageType(avi)).toBeNull()
    expect(inspectAttachment(avi)).toEqual({ ok: false, reason: 'unsupported_type' })
  })
})
