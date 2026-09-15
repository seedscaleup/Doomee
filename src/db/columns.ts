import { type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * ============================================================================
 * A `timestamptz` AS AN INSTANT THE BROWSER CAN PARSE.
 *
 * Timestamps cross to the client as strings — a `Date` is not serialisable
 * through a Server Component boundary — and the string has to survive
 * `new Date(...)` on the other side.
 *
 * PostgreSQL's `OF` pattern does NOT survive it. `to_char(now(), '…SSOF')`
 * returns `2026-09-15T13:57:39+00`, an offset with no minutes, which is not
 * valid ISO 8601: V8 answers `Invalid Date`, and `format.dateTime` then throws
 * `FORMATTING_ERROR` and renders "Invalid Date" on the page. Seven query
 * modules were doing exactly that, and the failure is silent — a formatter
 * that logs and falls back is how a wrong date ships.
 *
 * So the conversion happens once, here: the value is moved to UTC and stamped
 * with `Z`, which every runtime parses. The reader's own time zone is applied
 * at the point of DISPLAY, by `Intl`, where it belongs (CLAUDE.md §8).
 * ============================================================================
 */
export function isoInstant(column: AnyPgColumn | SQL): SQL<string> {
  return sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
}

/** The same, for a column that may be null. */
export function isoInstantOrNull(column: AnyPgColumn | SQL): SQL<string | null> {
  return sql<string | null>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
}
