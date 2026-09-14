import { serverEnv } from '@/lib/env'
import { createFilesystemStorageAdapter } from './filesystem-adapter'
import { createS3StorageAdapter } from './s3-adapter'
import type { StorageAdapter } from './types'

let adapter: StorageAdapter | undefined

/**
 * A bucket when one is configured, the filesystem otherwise — so a missing
 * S3_BUCKET never blocks local work, exactly as a missing SMTP_URL does not.
 */
export function storage(): StorageAdapter {
  if (adapter) return adapter
  const env = serverEnv()

  adapter =
    env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? createS3StorageAdapter({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION ?? 'eu-west-1',
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        })
      : createFilesystemStorageAdapter({
          directory: env.STORAGE_DIR,
          appUrl: env.APP_URL,
          secret: env.AUTH_SECRET,
        })

  return adapter
}

/** Test seam, mirroring setMailer. */
export function setStorage(next: StorageAdapter | undefined): void {
  adapter = next
}

export { createFilesystemStorageAdapter } from './filesystem-adapter'
export { isSafeStorageKey, storageKey } from './keys'
export { createS3StorageAdapter } from './s3-adapter'
export { signStorageLink, verifyStorageLink } from './signature'
export { MAX_SIGNED_URL_TTL_SECONDS, type StorageAdapter } from './types'
