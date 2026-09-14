'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import type { Locale } from '@/i18n/routing'
import { createClient, updateClient } from '@/modules/clients/mutations'
import type { IndustryOption } from '@/modules/clients/types'

export type ClientDraft = {
  id: string
  name: string
  industryId: string | null
  status: 'prospect' | 'active' | 'paused' | 'archived'
  description: string | null
  website: string | null
  email: string | null
  phone: string | null
  accountTeamNote: string | null
}

const STATUSES = ['prospect', 'active', 'paused', 'archived'] as const

/**
 * Create and edit share one sheet. The only difference is whether an existing
 * client is passed in, so the two paths cannot drift apart in wording, layout
 * or validation.
 *
 * "Less typing": only the name is required. Everything else can wait until it
 * is actually known.
 */
export function ClientFormSheet({
  open,
  client,
  industries,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean
  client?: ClientDraft
  industries: IndustryOption[]
  locale: Locale
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('clients.form')
  const tStatus = useTranslations('status.client')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    const payload = {
      name: String(form.get('name')),
      industryId: asOptional(form.get('industryId')),
      status: String(form.get('status')) as (typeof STATUSES)[number],
      description: asOptional(form.get('description')),
      website: asOptional(form.get('website')),
      email: asOptional(form.get('email')),
      phone: asOptional(form.get('phone')),
      accountTeamNote: asOptional(form.get('accountTeamNote')),
    }

    try {
      if (client) await updateClient({ id: client.id, ...payload })
      else await createClient(payload)
      onSaved()
    } catch {
      setError(t('failed'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={client ? t('editTitle') : t('createTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('name')}>
        {({ id }) => (
          <TextInput id={id} name="name" defaultValue={client?.name} required minLength={2} />
        )}
      </Field>

      <Field label={t('industry')}>
        {({ id }) => (
          <Select id={id} name="industryId" defaultValue={client?.industryId ?? ''}>
            <option value="">{t('noIndustry')}</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.labels[locale] ?? industry.code}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('status')}>
        {({ id }) => (
          <Select id={id} name="status" defaultValue={client?.status ?? 'active'}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('email')}>
        {({ id }) => (
          <TextInput id={id} name="email" type="email" defaultValue={client?.email ?? ''} />
        )}
      </Field>

      <Field label={t('phone')}>
        {({ id }) => <TextInput id={id} name="phone" defaultValue={client?.phone ?? ''} />}
      </Field>

      <Field label={t('website')}>
        {({ id }) => <TextInput id={id} name="website" defaultValue={client?.website ?? ''} />}
      </Field>

      {/* Internal note: absent from the portal views entirely (ADR-026). */}
      <Field label={t('accountTeamNote')} hint={t('accountTeamNoteHint')}>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="accountTeamNote"
            aria-describedby={describedBy}
            defaultValue={client?.accountTeamNote ?? ''}
          />
        )}
      </Field>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}
