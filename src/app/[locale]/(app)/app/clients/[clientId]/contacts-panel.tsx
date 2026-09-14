'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { EmptyState, SheetForm, StatusBadge } from '@/components/patterns'
import { Button, Field, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { addClientContact } from '@/modules/clients/mutations'
import type { ContactRow } from '@/modules/clients/types'

export function ContactsPanel({
  clientId,
  contacts,
}: {
  clientId: string
  contacts: ContactRow[]
}) {
  const t = useTranslations('clients.contacts')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    try {
      await addClientContact({
        clientId,
        name: String(form.get('name')),
        email: String(form.get('email')),
        jobTitle: String(form.get('jobTitle') ?? '') || undefined,
        isPrimary: form.get('isPrimary') === 'on',
      })
      setAdding(false)
      router.refresh()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>{t('add')}</Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-wrap items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{contact.name}</span>
                <span className="text-label text-muted">{contact.email}</span>
                {contact.jobTitle ? (
                  <span className="text-caption text-subtle">{contact.jobTitle}</span>
                ) : null}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {contact.isPrimary ? (
                  <StatusBadge label={t('primaryBadge')} tone="progress" />
                ) : null}
                {/* Recording who to talk to and granting them access to the
                    product are two different decisions; the portal invitation
                    is its own act (LOT 9). */}
                <StatusBadge
                  label={contact.userId ? t('portalAccess') : t('noPortalAccess')}
                  tone={contact.userId ? 'success' : 'neutral'}
                />
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
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setAdding(false)}
      >
        <Field label={t('name')}>{({ id }) => <TextInput id={id} name="name" required />}</Field>
        <Field label={t('email')}>
          {({ id }) => <TextInput id={id} name="email" type="email" required />}
        </Field>
        <Field label={t('jobTitle')}>{({ id }) => <TextInput id={id} name="jobTitle" />}</Field>
        <label className="flex min-h-touch items-center gap-2 text-label">
          <input type="checkbox" name="isPrimary" className="size-4" />
          {t('primary')}
        </label>
      </SheetForm>
    </div>
  )
}
