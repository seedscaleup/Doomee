import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFilesystemStorageAdapter } from '@/lib/storage/filesystem-adapter'
import { createS3StorageAdapter } from '@/lib/storage/s3-adapter'
import type { StorageAdapter } from '@/lib/storage/types'

/**
 * ONE contract, TWO implementations, the same tests (ADR-021).
 *
 * This is what makes "the hosting choice is reversible" a fact rather than a
 * claim: the filesystem adapter is not a stub kept alive by mocks, and the S3
 * one runs against a real S3 API in a container. If a provider is swapped
 * tomorrow, this file says whether the new one behaves.
 */
const SECRET = 'a-secret-that-is-at-least-32-characters-long'
const BUCKET = 'doomee-test'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

type Subject = { name: string; adapter: StorageAdapter }

let minio: StartedTestContainer | undefined
let directory: string | undefined
const subjects: Subject[] = []

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'doomee-storage-'))
  subjects.push({
    name: 'filesystem',
    adapter: createFilesystemStorageAdapter({
      directory,
      appUrl: 'http://127.0.0.1:3100',
      secret: SECRET,
    }),
  })

  // MinIO's own registry, pinned: quay.io is where the project publishes, and a
  // floating tag would make this suite depend on whatever shipped this morning.
  minio = await new GenericContainer('quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z')
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: 'doomee', MINIO_ROOT_PASSWORD: 'doomee-secret' })
    .withExposedPorts(9000)
    .start()

  const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`
  const s3 = createS3StorageAdapter({
    endpoint,
    region: 'eu-west-1',
    bucket: BUCKET,
    accessKeyId: 'doomee',
    secretAccessKey: 'doomee-secret',
  })

  // Creating the bucket is deployment, not application code, so it is done here
  // with a plain request rather than by widening the port with a createBucket.
  const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    endpoint,
    region: 'eu-west-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'doomee', secretAccessKey: 'doomee-secret' },
  })
  await client.send(new CreateBucketCommand({ Bucket: BUCKET }))

  subjects.push({ name: 's3', adapter: s3 })
}, 300_000)

afterAll(async () => {
  await minio?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('the storage contract', () => {
  it('has both implementations to compare', () => {
    expect(subjects.map((subject) => subject.name)).toEqual(['filesystem', 's3'])
  })

  it('stores and reads back the exact bytes', async () => {
    for (const { name, adapter } of subjects) {
      const key = `org-a/client-logo/${name}-roundtrip.png`
      await adapter.put({ key, body: PNG, contentType: 'image/png' })

      const read = await adapter.get(key)
      expect(read, name).not.toBeNull()
      expect(Array.from(read as Uint8Array), name).toEqual(Array.from(PNG))
    }
  })

  it('answers null for an object that is not there', async () => {
    for (const { name, adapter } of subjects) {
      expect(await adapter.get(`org-a/client-logo/${name}-absent.png`), name).toBeNull()
    }
  })

  it('removes an object, and removing it again is not an error', async () => {
    for (const { name, adapter } of subjects) {
      const key = `org-a/client-logo/${name}-removable.png`
      await adapter.put({ key, body: PNG, contentType: 'image/png' })

      await adapter.remove(key)
      expect(await adapter.get(key), name).toBeNull()
      await expect(adapter.remove(key), name).resolves.toBeUndefined()
    }
  })

  it('signs a URL that carries its own expiry', async () => {
    for (const { name, adapter } of subjects) {
      const key = `org-a/client-logo/${name}-signed.png`
      await adapter.put({ key, body: PNG, contentType: 'image/png' })

      const url = await adapter.signedUrl(key, 300)
      expect(url, name).toMatch(/^https?:\/\//)
      // Never a bare object URL: something in it has to expire.
      expect(url, name).toMatch(/expires|Expires|X-Amz-Expires/)
    }
  })

  it('refuses a key that would climb out of its prefix', async () => {
    const local = subjects[0]?.adapter as StorageAdapter

    await expect(
      local.put({ key: '../escaped.png', body: PNG, contentType: 'image/png' }),
    ).rejects.toThrow(/unsafe storage key/)
    await expect(local.signedUrl('../escaped.png', 300)).rejects.toThrow(/unsafe storage key/)
  })
})

/** The S3 link is the one a browser actually follows, so follow it. */
describe('an S3 signed URL', () => {
  it('serves the object, then stops working', async () => {
    const adapter = subjects[1]?.adapter as StorageAdapter
    const key = 'org-a/client-logo/fetchable.png'
    await adapter.put({ key, body: PNG, contentType: 'image/png' })

    const live = await fetch(await adapter.signedUrl(key, 300))
    expect(live.status).toBe(200)
    expect(Array.from(new Uint8Array(await live.arrayBuffer()))).toEqual(Array.from(PNG))

    // One second, then let it lapse: an expired presigned URL is refused by the
    // bucket itself, with no help from us.
    const shortLived = await adapter.signedUrl(key, 1)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect((await fetch(shortLived)).status).toBe(403)
  }, 30_000)
})
