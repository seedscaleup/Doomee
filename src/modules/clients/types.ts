/**
 * Data shapes shared between the server and the browser.
 *
 * A separate file, with no import of anything server-side, because a client
 * component that needs a row type must not have to reach into queries.ts and
 * drag `server-only` into the bundle with it (ADR-030).
 */
export type ClientStatusValue = 'prospect' | 'active' | 'paused' | 'archived'

export type ClientRow = {
  id: string
  name: string
  slug: string
  status: ClientStatusValue
  industryLabels: Record<string, string> | null
  ownerName: string | null
  contactCount: number
}

export type IndustryOption = {
  id: string
  code: string
  labels: Record<string, string>
}

export type ContactRow = {
  id: string
  name: string
  email: string
  jobTitle: string | null
  isPrimary: boolean
  /** Non-null once the contact has accepted their portal invitation. */
  userId: string | null
}
