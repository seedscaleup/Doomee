import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter } from './types'

/**
 * Any S3-compatible bucket: MinIO, Scaleway, OVH, Cloudflare R2, AWS.
 *
 * The SDK is confined to this file (ADR-021). `forcePathStyle` is on because
 * most European providers and MinIO serve path-style addressing, and because a
 * virtual-host style URL bakes the provider's domain shape into every link.
 */
export function createS3StorageAdapter(options: {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}): StorageAdapter {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  })

  return {
    name: 's3',

    async put(object) {
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: object.key,
          Body: object.body,
          ContentType: object.contentType,
        }),
      )
    },

    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }))
        const bytes = await result.Body?.transformToByteArray()
        return bytes ?? null
      } catch {
        // A missing object is an answer, not a failure: the caller decides
        // whether "nothing there" is a problem.
        return null
      }
    },

    async signedUrl(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: options.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      })
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
    },
  }
}
