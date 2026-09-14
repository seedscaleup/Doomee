/**
 * Pure rules about uploaded bytes. No I/O, no database — testable on their own,
 * which is the point: this is the code that decides whether a file is allowed
 * anywhere near the product.
 */

/**
 * The image types a logo may be, decided by READING THE BYTES.
 *
 * An extension is a claim by whoever uploads, and a Content-Type header is the
 * same claim in a different hat (docs/architecture.md §12). Only the signature
 * at the start of the file is evidence.
 *
 * SVG is deliberately absent and stays absent: it is a document that can carry
 * script, so serving one inline from our own origin would be stored XSS with
 * extra steps. PDF, video and anything else belong to attachments (LOT 5),
 * where they are served as downloads.
 */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number]

/** 2 MB. A logo larger than this is a mistake, not a requirement. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

const EXTENSIONS: Record<LogoMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function extensionFor(mimeType: LogoMimeType): string {
  return EXTENSIONS[mimeType]
}

/**
 * Returns what the bytes actually are, or null if they are not an image we
 * accept. Null is the only other answer: there is no "probably".
 */
export function detectImageType(bytes: Uint8Array): LogoMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'

  // WEBP is a RIFF container: "RIFF" then four size bytes then "WEBP".
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp'
  }

  return null
}

export type UploadVerdict =
  | { ok: true; mimeType: LogoMimeType }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' }

/** One decision, one place: size and type, in the order that costs least. */
export function inspectLogo(bytes: Uint8Array): UploadVerdict {
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' }
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, reason: 'too_large' }

  const mimeType = detectImageType(bytes)
  if (!mimeType) return { ok: false, reason: 'unsupported_type' }

  return { ok: true, mimeType }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}
