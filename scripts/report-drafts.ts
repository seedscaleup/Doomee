/**
 * CLI entry point for the scheduled report drafts.
 *
 * Thin on purpose: the job is domain logic and lives in
 * `src/modules/reports/job.ts`, where it calls the same providers the creation
 * wizard calls.
 *
 *   pnpm reports:drafts weekly    # every Friday  — the internal point
 *   pnpm reports:drafts monthly   # end of month  — one draft per client
 */
import { configureDatabase } from '../src/db/tenant'
import { createScheduledDrafts } from '../src/modules/reports/job'

const kind = process.argv[2] === 'monthly' ? 'monthly' : 'weekly'

const adminUrl = process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL
const appUrl = process.env.DATABASE_URL

if (!adminUrl || !appUrl) {
  throw new Error('DATABASE_URL (and optionally DATABASE_AUTH_URL) are required')
}

// The pools point at the APPLICATION role: the job writes through withTenant,
// subject to row level security like every other write.
configureDatabase({ connectionString: appUrl })

createScheduledDrafts(adminUrl, kind).then(
  ({ organizations, created }) => {
    console.warn(`Created ${created} ${kind} draft(s) across ${organizations} org(s).`)
    process.exit(0)
  },
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
