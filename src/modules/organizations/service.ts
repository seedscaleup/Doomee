/**
 * Pure logic only: no database, no request context, no I/O (CLAUDE.md §5).
 * This is the part that is unit-tested without any infrastructure.
 */
const SLUG_UNSAFE = /[^a-z0-9]+/g
const SLUG_EDGES = /^-+|-+$/g

/** Builds a URL-safe slug from a display name, accents folded. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(SLUG_UNSAFE, '-')
    .replace(SLUG_EDGES, '')
    .slice(0, 60)
}

/**
 * Smart default (UX principle 4): the first organisation of a new sign-up is
 * named after the person, so nobody has to invent one to get started.
 */
export function defaultOrganizationName(userName: string): string {
  const trimmed = userName.trim()
  return trimmed.length > 0 ? trimmed : 'doomee'
}

/**
 * A slug collision must not fail the sign-up: the user did nothing wrong.
 * Appending a short discriminator is invisible and always succeeds.
 */
export function disambiguateSlug(base: string, attempt: number): string {
  if (attempt === 0) return base
  const suffix = `-${attempt + 1}`
  return `${base.slice(0, 60 - suffix.length)}${suffix}`
}
