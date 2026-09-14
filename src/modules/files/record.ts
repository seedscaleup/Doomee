import 'server-only'

import { createHash } from 'node:crypto'
import { uuidv7 } from 'uuidv7'
import { files } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { storage, storageKey } from '@/lib/storage'

/**
 * Stores bytes and records the row, in the caller's transaction.
 *
 * Order matters: the object goes to storage FIRST, then the row. A row without
 * an object is a broken link; an object without a row is a few orphaned bytes
 * that a lifecycle rule sweeps up. The second failure is the cheap one.
 */
export async function storeFile(
  db: TenantDb,
  input: {
    organizationId: string
    uploadedBy: string
    kind: 'client-logo' | 'avatar' | 'attachment' | 'report'
    filename: string
    mimeType: string
    extension: string
    bytes: Uint8Array
  },
): Promise<{ id: string; storageKey: string }> {
  const id = uuidv7()
  const key = storageKey({
    organizationId: input.organizationId,
    kind: input.kind,
    id,
    extension: input.extension,
  })

  await storage().put({ key, body: input.bytes, contentType: input.mimeType })

  await db.insert(files).values({
    id,
    organizationId: input.organizationId,
    storageKey: key,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    checksum: createHash('sha256').update(input.bytes).digest('hex'),
    uploadedBy: input.uploadedBy,
    // Internal by default, like every exposure flag (rule 2).
    isClientVisible: false,
  })

  return { id, storageKey: key }
}
