'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { EmptyState, SheetForm } from '@/components/patterns'
import { Alert, Button, Field, Select } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { addProjectMember, removeProjectMember } from '@/modules/projects/mutations'
import type {
  ColleagueOption,
  ProjectMemberRoleValue,
  ProjectMemberRow,
} from '@/modules/projects/types'

const ROLES: readonly ProjectMemberRoleValue[] = ['lead', 'member', 'reviewer']

/**
 * The project team — which is also the access list.
 *
 * Adding someone here is not decoration: `project_members` is what a
 * collaborator's reads are scoped by. The panel says so out loud, because an
 * access decision that looks like a directory entry is an access decision
 * people make carelessly.
 */
export function MembersPanel({
  projectId,
  members,
  colleagues,
  canManage,
}: {
  projectId: string
  members: ProjectMemberRow[]
  colleagues: ColleagueOption[]
  canManage: boolean
}) {
  const t = useTranslations('projects.members')
  const tRole = useTranslations('projects.memberRole')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const onTeam = new Set(members.map((member) => member.userId))
  const available = colleagues.filter((colleague) => !onTeam.has(colleague.userId))

  async function onAdd(form: FormData) {
    setError(null)
    try {
      await addProjectMember({
        projectId,
        userId: String(form.get('userId')),
        role: String(form.get('role')) as ProjectMemberRoleValue,
      })
      setAdding(false)
      router.refresh()
    } catch {
      setError(t('failed'))
    }
  }

  async function onRemove(userId: string) {
    setError(null)
    setPending(userId)
    try {
      await removeProjectMember({ projectId, userId })
      router.refresh()
    } catch {
      setError(t('failed'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted">{t('scopeHint')}</p>
        {canManage ? (
          <Button onClick={() => setAdding(true)} disabled={available.length === 0}>
            {t('add')}
          </Button>
        ) : null}
      </div>

      {members.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{member.name}</span>
                <span className="text-label text-muted">{member.email}</span>
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-label text-muted">{tRole(member.role)}</span>
                {canManage ? (
                  <Button
                    variant="ghost"
                    onClick={() => onRemove(member.userId)}
                    disabled={pending !== null}
                  >
                    {pending === member.userId ? tCommon('loading') : t('remove')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <SheetForm
        open={adding}
        title={t('add')}
        submitLabel={tCommon('save')}
        cancelLabel={tCommon('cancel')}
        pendingLabel={tCommon('loading')}
        onSubmit={onAdd}
        onCancel={() => setAdding(false)}
      >
        <Field label={t('person')}>
          {({ id }) => (
            <Select id={id} name="userId" required>
              {available.map((colleague) => (
                <option key={colleague.userId} value={colleague.userId}>
                  {colleague.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('role')}>
          {({ id }) => (
            <Select id={id} name="role" defaultValue="member">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {tRole(role)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </SheetForm>
    </div>
  )
}
