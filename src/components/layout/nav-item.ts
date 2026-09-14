import type { NavKey } from '@/lib/permissions'

/**
 * A navigation entry that has already been filtered by permissions and
 * labelled in the reader's language. Lives in its own module so the shell and
 * the command palette can share it without importing each other.
 */
export type ShellNavItem = {
  key: NavKey
  href: string
  label: string
  primary: boolean
}
