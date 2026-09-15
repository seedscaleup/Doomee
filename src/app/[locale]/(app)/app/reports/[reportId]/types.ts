import type { ReportBlock } from '@/modules/reports/present'
import type { SectionRow } from '@/modules/reports/types'

/**
 * A section plus the blocks the server already shaped for it.
 *
 * Its own file so the editor and the section it renders do not import each
 * other — a cycle dependency-cruiser refuses, and rightly: two components that
 * need each other's types usually need a third file.
 */
export type EditableSection = SectionRow & {
  blocks: ReportBlock[]
  /** Resolved on the server, in the REPORT's language — never the reader's. */
  labels: Record<string, string>
  heading: string
}
