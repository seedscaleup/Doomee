'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, Select, TextInput } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { createReport } from '@/modules/reports/mutations'
import type { ClientOption, ProjectOption } from '@/modules/reports/types'

const TYPES = [
  'weekly_internal',
  'monthly',
  'project',
  'client',
  'campaign_review',
  'period_review',
] as const

/**
 * ============================================================================
 * THE CREATION ASSISTANT — type → scope → period → LANGUAGE → generation.
 *
 * Five questions, and the fifth produces a filled-in report rather than an
 * empty form: the providers run as part of the creation, so what comes back
 * already contains the period's actions, deliverables, results and insights
 * (roadmap LOT 12.3). That is the whole bet of the lot — the raw data is
 * already worth reading, before anyone writes a word.
 *
 * The LANGUAGE is asked, and it defaults to the author's reporting language,
 * never to the language of the interface they happen to be using (ADR-011). A
 * French team writes an English report without switching their own screens.
 * ============================================================================
 */
export function ReportWizard({
  open,
  projects,
  clients,
  defaultLocale,
  onClose,
}: {
  open: boolean
  projects: ProjectOption[]
  clients: ClientOption[]
  defaultLocale: 'fr' | 'en'
  onClose: () => void
}) {
  const t = useTranslations('reports.wizard')
  const tTypes = useTranslations('reports.types')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)

    try {
      const created = await createReport({
        type: asType(String(form.get('type'))),
        title: String(form.get('title')),
        projectId: asOptional(form.get('projectId')),
        clientId: asOptional(form.get('clientId')),
        periodStart: String(form.get('periodStart')),
        periodEnd: String(form.get('periodEnd')),
        locale: form.get('locale') === 'en' ? 'en' : 'fr',
      })

      // Every action leads somewhere (UX principle 5): the report opens in its
      // editor, already filled in, rather than dropping back onto the list.
      router.push(`/app/reports/${created.id}` as '/app')
    } catch {
      setError(t('failed'))
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  return (
    <SheetForm
      open={open}
      title={t('title')}
      description={t('description')}
      submitLabel={t('submit')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={t('generating')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('type')}>
        {({ id }) => (
          <Select id={id} name="type" defaultValue="monthly">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('name')}>
        {({ id }) => (
          <TextInput
            id={id}
            name="title"
            placeholder={t('namePlaceholder')}
            required
            minLength={2}
            maxLength={240}
          />
        )}
      </Field>

      <Field label={t('project')}>
        {({ id }) => (
          <Select id={id} name="projectId" defaultValue="">
            <option value="">{t('noProject')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('client')} hint={t('wholeOrganization')}>
        {({ id }) => (
          <Select id={id} name="clientId" defaultValue="">
            <option value="">{t('noClient')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('periodStart')}>
          {({ id }) => (
            <TextInput id={id} name="periodStart" type="date" defaultValue={monthAgo} required />
          )}
        </Field>
        <Field label={t('periodEnd')}>
          {({ id }) => (
            <TextInput id={id} name="periodEnd" type="date" defaultValue={today} required />
          )}
        </Field>
      </div>

      <Field label={t('locale')} hint={t('localeHint')}>
        {({ id }) => (
          <Select id={id} name="locale" defaultValue={defaultLocale}>
            <option value="fr">{tCommon('french')}</option>
            <option value="en">{tCommon('english')}</option>
          </Select>
        )}
      </Field>
    </SheetForm>
  )
}

function asType(value: string): (typeof TYPES)[number] {
  return TYPES.find((type) => type === value) ?? 'monthly'
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? undefined : text
}
