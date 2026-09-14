/**
 * Storage keys are opaque and tenant-prefixed.
 *
 * Opaque because a guessable key is a public file waiting to happen (R13);
 * tenant-prefixed because it makes a misrouted object visible at a glance in a
 * bucket listing, and because lifecycle rules are written on prefixes.
 */
export function storageKey(input: {
  organizationId: string
  kind: 'client-logo' | 'avatar' | 'attachment' | 'report'
  id: string
  extension: string
}): string {
  return `${input.organizationId}/${input.kind}/${input.id}.${input.extension}`
}

/** Rejects anything that could climb out of the prefix it was given. */
export function isSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 512) return false
  if (key.startsWith('/') || key.includes('//')) return false
  if (key.split('/').some((segment) => segment === '.' || segment === '..')) return false
  return /^[A-Za-z0-9/._-]+$/.test(key)
}
