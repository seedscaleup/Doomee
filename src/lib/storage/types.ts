/**
 * The storage port (ADR-021). Nothing outside src/lib/storage may import an
 * object-storage SDK, and dependency-cruiser enforces it.
 *
 * Two implementations exist, both tested, because an abstraction with a single
 * implementation is only a guess at portability.
 */
export type StorageAdapter = {
  readonly name: string

  put: (object: { key: string; body: Uint8Array; contentType: string }) => Promise<void>

  /**
   * A URL that stops working.
   *
   * Never a public object URL: the permission check happens before this is
   * called, and the link it returns is short-lived so that forwarding it does
   * not turn into permanent access (R13).
   */
  signedUrl: (key: string, ttlSeconds: number) => Promise<string>

  /** Reads an object back. Used by the local adapter's own serving route. */
  get: (key: string) => Promise<Uint8Array | null>

  remove: (key: string) => Promise<void>
}

/** Five minutes is the ceiling the risk register fixed for a download link (R13). */
export const MAX_SIGNED_URL_TTL_SECONDS = 300
