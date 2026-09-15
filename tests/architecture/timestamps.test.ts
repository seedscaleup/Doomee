import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ============================================================================
 * NO QUERY MAY EMIT A TIMESTAMP THE BROWSER CANNOT PARSE.
 *
 * `to_char(x, 'YYYY-MM-DD"T"HH24:MI:SSOF')` returns `2026-09-15T13:57:39+00`.
 * That offset has no minutes, so it is not valid ISO 8601 and `new Date(…)`
 * answers `Invalid Date`. `format.dateTime` then logs a FORMATTING_ERROR and
 * renders the string "Invalid Date" on the page — a failure that reaches a
 * client without failing anything.
 *
 * Seven query modules shipped that pattern before an E2E run surfaced the log
 * line. A rule written only in a comment would have been forgotten by the next
 * query, so it is a test (ADR-055).
 * ============================================================================
 */
const SOURCE = join(import.meta.dirname, '../../src')

describe('timestamps crossing to the client', () => {
  const offenders = filesUnder(SOURCE)
    .filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
    .filter((path) => !path.endsWith(join('db', 'columns.ts')))
    .filter((path) => readFileSync(path, 'utf8').includes('SSOF'))

  it('never formats one with the OF pattern', () => {
    expect(offenders.map((path) => path.slice(SOURCE.length + 1))).toEqual([])
  })

  it('has a helper for the job, and it stamps UTC', async () => {
    const { isoInstant } = await import('@/db/columns')
    const { sql } = await import('drizzle-orm')

    const fragment = isoInstant(sql`created_at`)
    const rendered = JSON.stringify(fragment)

    expect(rendered).toContain("AT TIME ZONE 'UTC'")
    expect(rendered).toContain('HH24:MI:SS')
    expect(rendered).not.toContain('OF')
  })
})

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}
