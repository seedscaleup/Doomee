import { getTranslations } from 'next-intl/server'
import { listInvitations } from '@/modules/members'
import { listColleagues } from '@/modules/organizations'
import { requirePageSession } from '@/server'
import { InviteForm } from './invite-form'

export default async function TeamPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)

  const t = await getTranslations('settings.members')
  const tRoles = await getTranslations('roles')

  const [colleagues, invitations] = await Promise.all([listColleagues(), listInvitations()])
  const pending = invitations.filter((invitation) => invitation.state === 'pending')

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      <InviteForm />

      <ul className="flex flex-col gap-2">
        {colleagues.map((colleague) => (
          <li
            key={colleague.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[--radius-doomee] border border-border bg-surface px-3 py-3"
          >
            <span className="flex flex-col">
              <span className="font-medium">{colleague.name}</span>
              <span className="text-sm text-muted">{colleague.email}</span>
            </span>
            <span className="text-sm text-muted">{tRoles(colleague.role)}</span>
          </li>
        ))}

        {pending.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[--radius-doomee] border border-dashed border-border px-3 py-3"
          >
            <span className="flex flex-col">
              <span className="font-medium">{invitation.email}</span>
              <span className="text-sm text-muted">{t('pending')}</span>
            </span>
            <span className="text-sm text-muted">{tRoles(invitation.role)}</span>
          </li>
        ))}

        {colleagues.length === 0 && pending.length === 0 ? (
          <li className="text-sm text-muted">{t('empty')}</li>
        ) : null}
      </ul>
    </section>
  )
}
