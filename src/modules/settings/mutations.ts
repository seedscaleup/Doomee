'use server'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'
import { users } from '@/db/schema'
import { serverEnv } from '@/lib/env'
import { AppError } from '@/lib/errors/app-error'
import { requireSession } from '@/server'
import { type UpdateProfileInput, updateProfileSchema } from './schemas'

/**
 * Profile preferences belong to the PERSON, not to an organisation: the same
 * account keeps one language across every tenant it belongs to (ADR-023).
 *
 * users is revoked from app_user for writes (ADR-028), so this runs on the auth
 * connection — and only ever on the caller's own row, which is what makes that
 * safe.
 */
let pool: Pool | undefined

function profileDb() {
  pool ??= new Pool({
    connectionString: serverEnv().DATABASE_AUTH_URL,
    max: 3,
    application_name: 'doomee-profile',
  })
  return drizzle(pool, { schema })
}

export async function updateProfile(raw: UpdateProfileInput) {
  const session = await requireSession()
  const parsed = updateProfileSchema.safeParse(raw)
  if (!parsed.success) throw new AppError('validation_failed', 'errors.validation_failed')

  const input = parsed.data

  await profileDb()
    .update(users)
    .set({
      name: input.name,
      locale: input.locale,
      reportLocale: input.reportLocale,
      timezone: input.timezone,
      dateFormat: input.dateFormat,
      updatedAt: new Date(),
    })
    // The id comes from the session, never from the payload: a user can only
    // ever rewrite their own profile.
    .where(eq(users.id, session.userId))

  return { locale: input.locale }
}

export async function getProfile() {
  const session = await requireSession()

  const rows = await profileDb()
    .select({
      name: users.name,
      email: users.email,
      locale: users.locale,
      reportLocale: users.reportLocale,
      timezone: users.timezone,
      dateFormat: users.dateFormat,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  const profile = rows[0]
  if (!profile) throw new AppError('not_found', 'errors.not_found')
  return profile
}
