import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isSafeStorageKey } from './keys'
import { signStorageLink } from './signature'
import type { StorageAdapter } from './types'

/**
 * Objects on the local filesystem.
 *
 * This is the default when no bucket is configured, so `pnpm dev` and the test
 * suites work with no infrastructure at all — and it is the second real
 * implementation ADR-021 asks for, not a stub: it stores, signs, serves and
 * deletes, and it is tested through the same contract as the S3 one.
 *
 * Its signed URL points at our own route, which re-checks the signature. The
 * S3 one points at the bucket. Both stop working when they expire.
 */
export function createFilesystemStorageAdapter(options: {
  directory: string
  appUrl: string
  secret: string
}): StorageAdapter {
  const root = resolve(options.directory)

  function pathFor(key: string): string {
    if (!isSafeStorageKey(key)) throw new Error('unsafe storage key')

    const full = resolve(join(root, key))
    // Belt and braces: even with a key that passed the check, refuse anything
    // that resolves outside the root.
    if (full !== root && !full.startsWith(`${root}/`)) throw new Error('unsafe storage key')
    return full
  }

  return {
    name: 'filesystem',

    async put(object) {
      const path = pathFor(object.key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, object.body)
    },

    async get(key) {
      return readFile(pathFor(key)).catch(() => null)
    },

    async signedUrl(key, ttlSeconds) {
      if (!isSafeStorageKey(key)) throw new Error('unsafe storage key')

      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
      const signature = signStorageLink({ key, expiresAt, secret: options.secret })
      const url = new URL(`${options.appUrl}/api/storage/${key}`)
      url.searchParams.set('expires', String(expiresAt))
      url.searchParams.set('signature', signature)
      return url.toString()
    },

    async remove(key) {
      await rm(pathFor(key), { force: true })
    },
  }
}
