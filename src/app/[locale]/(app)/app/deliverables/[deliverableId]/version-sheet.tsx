'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SheetForm } from '@/components/patterns'
import { Field, TextInput } from '@/components/ui/field'
import { addVersion } from '@/modules/deliverables/mutations'
import { describesSomething } from '@/modules/deliverables/service'

/**
 * A new iteration.
 *
 * The "a version must be something" rule is checked HERE for a fast answer and
 * again on the server, which is the one that decides. The client-side check is
 * courtesy; the server-side one is the control.
 */
export function VersionSheet({
  open,
  deliverableId,
  onClose,
  onSaved,
}: {
  open: boolean
  deliverableId: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('deliverables.versions')
  const tCommon = useTranslations('common')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(form: FormData) {
    setError(null)
    const externalUrl = asOptional(form.get('externalUrl'))
    const notes = asOptional(form.get('notes'))

    if (!describesSomething({ externalUrl })) {
      setError(t('needsContent'))
      return
    }

    try {
      await addVersion({ deliverableId, externalUrl, notes })
      onSaved()
    } catch {
      setError(t('needsContent'))
    }
  }

  return (
    <SheetForm
      open={open}
      title={t('addTitle')}
      submitLabel={tCommon('save')}
      cancelLabel={tCommon('cancel')}
      pendingLabel={tCommon('loading')}
      error={error}
      onSubmit={onSubmit}
      onCancel={onClose}
    >
      <Field label={t('link')}>
        {({ id }) => <TextInput id={id} name="externalUrl" type="url" required />}
      </Field>
      <Field label={t('notes')}>{({ id }) => <TextInput id={id} name="notes" />}</Field>
    </SheetForm>
  )
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}
