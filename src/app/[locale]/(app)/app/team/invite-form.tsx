'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { inviteMember } from '@/modules/members/mutations'

const ROLES = ['direction', 'manager', 'collaborator'] as const

export function InviteForm() {
  const t = useTranslations('settings.members')
  const tRoles = useTranslations('roles')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSent(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))

    try {
      await inviteMember({ email, role: String(form.get('role')) as (typeof ROLES)[number] })
      setSent(email)
      router.refresh()
    } catch {
      setError(tErrors('internal'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-[--radius-doomee] border border-border bg-surface p-4"
      noValidate
    >
      {sent ? <Alert tone="success">{t('sent', { email: sent })}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t('email')}>
            {({ id }) => <TextInput id={id} name="email" type="email" required />}
          </Field>
        </div>
        <div className="sm:w-44">
          <Field label={t('role')}>
            {({ id }) => (
              <Select id={id} name="role" defaultValue="collaborator">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {tRoles(role)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {t('invite')}
        </Button>
      </div>
    </form>
  )
}
