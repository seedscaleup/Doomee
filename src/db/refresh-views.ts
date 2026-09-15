import { Client } from 'pg'

/**
 * The derived aggregates, as data.
 *
 * One entry per materialised view, in refresh order. Adding a view to the
 * product means adding a line here, not another script.
 */
const DERIVED_VIEWS = ['result_metrics_daily'] as const

/**
 * Rebuilds the derived aggregates.
 *
 * Run by a scheduled job, never inside a request: a refresh scans the base
 * table, and a user waiting for a page is not the right place to do that.
 *
 * `CONCURRENTLY` matters — it keeps the view readable while it rebuilds, so a
 * dashboard opened during the refresh shows the previous run's numbers rather
 * than blocking on it. It needs the unique index created alongside each view,
 * over PLAIN COLUMNS (migration 0013).
 *
 * Runs as the MIGRATOR, not as app_user: a materialised view cannot carry row
 * level security, so it is not granted to the application role at all. Whoever
 * reads it passes the organisation explicitly.
 */
export async function refreshDerivedViews(connectionString: string): Promise<{ views: number }> {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    for (const view of DERIVED_VIEWS) {
      /**
       * Ask PostgreSQL what state the view is in, rather than attempting the
       * concurrent refresh and reading the failure.
       *
       * An unpopulated view — after `REFRESH ... WITH NO DATA`, or restored
       * from a schema-only dump — rejects CONCURRENTLY, and it rejects it with
       * a message that is TRANSLATED on a localised server and that has been
       * reworded between major versions. Matching on that text is a fallback
       * that silently stops firing; `pg_matviews.ispopulated` is the same fact,
       * asked properly.
       */
      const { rows } = await client.query<{ ispopulated: boolean }>(
        'SELECT ispopulated FROM pg_matviews WHERE schemaname = current_schema() AND matviewname = $1',
        [view],
      )
      const state = rows[0]
      if (!state) throw new Error(`The materialised view ${view} does not exist.`)

      await client.query(
        state.ispopulated
          ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`
          : `REFRESH MATERIALIZED VIEW ${view}`,
      )
    }

    return { views: DERIVED_VIEWS.length }
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith('refresh-views.ts')) {
  const url = process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_AUTH_URL or DATABASE_URL is required')

  refreshDerivedViews(url).then(
    ({ views }) => console.warn(`Refreshed ${views} derived view(s).`),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
