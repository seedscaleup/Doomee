'use server'

import { z } from 'zod'
import { setActiveOrganization } from '@/lib/auth/session-store'
import { AppError } from '@/lib/errors/app-error'
import { requireSession } from '@/server'

const schema = z.object({ organizationId: z.uuid() })

/**
 * Switches the tenant the session is acting in.
 *
 * Not a defineAction: the target organisation is, by definition, not the one
 * the current actor belongs to. setActiveOrganization re-checks the membership
 * itself, so a user can only ever point their session at a tenant they are an
 * active member of.
 */
export async function switchOrganization(raw: { organizationId: string }) {
  const session = await requireSession()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new AppError('validation_failed', 'errors.validation_failed')

  const switched = await setActiveOrganization(session.userId, parsed.data.organizationId)
  // 404-shaped: never confirm that an organisation the user cannot join exists.
  if (!switched) throw new AppError('not_found', 'errors.not_found')

  return { organizationId: parsed.data.organizationId }
}
