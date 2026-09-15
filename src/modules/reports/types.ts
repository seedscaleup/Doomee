/**
 * Shapes shared between the server and the browser. No server import here, so
 * a client component can take a row type without dragging `server-only` into
 * the bundle (ADR-030).
 */
export type { ReportStatusValue, ReportType, SectionKey, ShareVerdict } from './service'

export type ReportRow = {
  id: string
  type: string
  title: string
  projectId: string | null
  projectName: string | null
  clientId: string | null
  clientName: string | null
  periodStart: string
  periodEnd: string
  locale: 'fr' | 'en'
  status: 'draft' | 'in_review' | 'published' | 'archived'
  publishedAt: string | null
  authorName: string | null
  sectionCount: number
  shareCount: number
}

export type SectionRow = {
  id: string
  key: import('./service').SectionKey
  sortOrder: number
  isIncluded: boolean
  isClientVisible: boolean
  titleOverride: string | null
  body: string | null
  data: Record<string, unknown> | null
  isEdited: boolean
}

export type ShareRow = {
  id: string
  expiresAt: string
  revokedAt: string | null
  hasPassword: boolean
  viewCount: number
  lastViewedAt: string | null
  recipientEmail: string | null
}

/** What a share link shows. Read from the SNAPSHOT, never the live tables (ADR-014). */
export type SharedReport = {
  title: string
  locale: 'fr' | 'en'
  periodStart: string
  periodEnd: string
  organizationName: string
  publishedAt: string | null
  sections: {
    key: import('./service').SectionKey
    title: string | null
    body: string | null
    data: unknown
  }[]
}

export type ProjectOption = { id: string; name: string }
export type ClientOption = { id: string; name: string }
