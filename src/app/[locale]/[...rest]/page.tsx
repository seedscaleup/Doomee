import { notFound } from 'next/navigation'

/**
 * Any unmatched path under a locale falls through to the localised
 * not-found page, so a 404 is always rendered in the reader's language.
 */
export default function CatchAllPage(): never {
  notFound()
}
