/**
 * CLI entry point for the health reconciliation job.
 *
 * A thin wrapper on purpose: the job itself is domain logic and lives in
 * `src/modules/health/job.ts`, where it can call the same `refreshProjectHealth`
 * the mutations call.
 */
import { configureDatabase } from '../src/db/tenant'
import { recomputeHealth } from '../src/modules/health/job'

const adminUrl = process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL
const appUrl = process.env.DATABASE_URL

if (!adminUrl || !appUrl) {
  throw new Error('DATABASE_URL (and optionally DATABASE_AUTH_URL) are required')
}

// The pools must point at the APPLICATION role: the job writes through
// withTenant, subject to row level security like every other write.
configureDatabase({ connectionString: appUrl })

recomputeHealth(adminUrl).then(
  ({ organizations, projects }) => {
    console.warn(`Recomputed health for ${projects} project(s) in ${organizations} org(s).`)
    process.exit(0)
  },
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
