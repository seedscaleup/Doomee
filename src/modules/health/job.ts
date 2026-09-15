import 'server-only'

import { Client } from 'pg'
import { withTenant } from '@/db/tenant'
import { refreshProjectHealth } from './mutations'

/**
 * ============================================================================
 * The scheduled reconciliation of the health score.
 *
 * `projects.health_score` is denormalised and written inside the transaction
 * that causes it to move (ADR-013). This job exists for everything that moves
 * it WITHOUT a transaction touching the project: a deadline passing at
 * midnight, a client leaving a deliverable unanswered for another day, an
 * action becoming overdue while nobody looked.
 *
 * Time itself changes the score, and time does not run a mutation.
 *
 * It lives in the MODULE, not in `src/db`: a job that recomputes a health
 * score is domain logic, and `src/db` importing a module would invert the
 * dependency rule (`app → modules → db|lib`). dependency-cruiser caught the
 * first version of this file doing exactly that.
 *
 * It calls `refreshProjectHealth` — the SAME function the mutations call. Two
 * ways of computing the same score is how a nightly job and a screen come to
 * disagree about a number that is supposed to mean something.
 * ============================================================================
 */
export async function recomputeHealth(
  adminConnectionString: string,
): Promise<{ organizations: number; projects: number }> {
  /**
   * The ONE cross-tenant question: which tenants exist. Answered by the
   * migrator, because no tenant context can enumerate organisations — and
   * answered here only. Every read and write of project data below goes
   * through `withTenant`, like everything else in the product (rule 1).
   */
  const admin = new Client({ connectionString: adminConnectionString })
  await admin.connect()

  try {
    const { rows: organizations } = await admin.query<{ id: string }>(
      `SELECT id FROM organizations WHERE deleted_at IS NULL AND status = 'active'`,
    )

    let projectCount = 0

    for (const organization of organizations) {
      const { rows: projects } = await admin.query<{ id: string }>(
        `SELECT id FROM projects
          WHERE organization_id = $1 AND deleted_at IS NULL AND status <> 'archived'
          ORDER BY health_computed_at ASC NULLS FIRST`,
        [organization.id],
      )

      for (const project of projects) {
        // One project, one transaction. A job that did them all in one would
        // hold a transaction open for as long as the slowest tenant.
        await withTenant({ organizationId: organization.id }, (db) =>
          refreshProjectHealth(db, organization.id, project.id),
        )
        projectCount += 1
      }
    }

    return { organizations: organizations.length, projects: projectCount }
  } finally {
    await admin.end()
  }
}
