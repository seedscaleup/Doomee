import { Client } from 'pg'

/**
 * Creates the login role the application connects as, and makes it a NOINHERIT
 * member of the two group roles created by migration 0002.
 *
 * Kept OUT of migrations on purpose: a migration is committed to the
 * repository, and credentials must never be.
 *
 * NOINHERIT is a security requirement, not a style choice. PostgreSQL matches
 * RLS policies with has_privs_of_role, so an INHERIT member of both app_user
 * and app_portal would be granted the union of their policies — the portal
 * would see internal rows. tests/integration/tenant-isolation.test.ts proves
 * this holds.
 */
export type ProvisionOptions = {
  adminUrl: string
  loginRole: string
  password: string
}

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

export async function provisionAppRole({
  adminUrl,
  loginRole,
  password,
}: ProvisionOptions): Promise<void> {
  if (!SAFE_IDENTIFIER.test(loginRole)) {
    throw new Error(`Unsafe role name: ${loginRole}`)
  }
  if (password.length < 12) {
    throw new Error('The application database password must be at least 12 characters')
  }

  const client = new Client({ connectionString: adminUrl })
  await client.connect()

  try {
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [loginRole])

    // The quoting is done by PostgreSQL's own format(): %I for the identifier,
    // %L for the password literal. Neither value is ever concatenated here, so
    // a password containing quotes cannot break out of the statement.
    const statements = await client.query<{ sql: string }>(
      `SELECT format($1, $2::text, $3::text) AS sql`,
      [
        exists.rowCount
          ? 'ALTER ROLE %I WITH LOGIN NOINHERIT PASSWORD %L'
          : 'CREATE ROLE %I WITH LOGIN NOINHERIT PASSWORD %L',
        loginRole,
        password,
      ],
    )
    const roleStatement = statements.rows[0]?.sql
    if (!roleStatement) throw new Error('Could not build the role statement')
    await client.query(roleStatement)

    const grants = await client.query<{ sql: string }>(
      `SELECT format('GRANT app_user, app_portal TO %I', $1::text) AS sql
       UNION ALL
       SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text)`,
      [loginRole],
    )
    for (const { sql } of grants.rows) {
      await client.query(sql)
    }
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith('provision.ts')) {
  const adminUrl = process.env.DATABASE_URL
  const loginRole = process.env.DATABASE_APP_ROLE ?? 'doomee_app'
  const password = process.env.DATABASE_APP_PASSWORD

  if (!adminUrl) throw new Error('DATABASE_URL is required')
  if (!password) throw new Error('DATABASE_APP_PASSWORD is required')

  provisionAppRole({ adminUrl, loginRole, password }).then(
    () => console.warn(`Provisioned login role ${loginRole}`),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
