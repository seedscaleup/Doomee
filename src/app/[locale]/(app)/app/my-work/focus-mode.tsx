'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Alert, Button } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { useRouter } from '@/i18n/navigation'
import { changeActionStatus } from '@/modules/actions/mutations'
import type { ActionRow } from '@/modules/actions/types'

/**
 * Focus Mode — one action on screen, at most five in the session.
 *
 * The cap is the feature (UX principle 2, *one thing at a time*). A focus list
 * of twenty is a backlog with a new name; five is what someone can hold. The
 * selection itself comes from the pure service, so it is the same notion of
 * "urgent" the rest of the product uses.
 */
export function FocusMode({
  open,
  actions,
  onClose,
}: {
  open: boolean
  actions: ActionRow[]
  onClose: () => void
}) {
  const t = useTranslations('myWork.focus')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [index, setIndex] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = actions[index]

  async function complete() {
    if (!current) return
    setError(null)
    setPending(true)
    try {
      await changeActionStatus({ id: current.id, status: 'done' })
      router.refresh()
      // Stay where we are: the list behind has shifted up, so this position now
      // holds the next thing to do.
      if (index >= actions.length - 1) onClose()
    } catch {
      setError(tCommon('retry'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('title')} description={t('hint')}>
      {current ? (
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <p className="text-caption text-subtle tabular-nums">
            {t('position', { index: index + 1, total: actions.length })}
          </p>

          <div className="flex flex-col gap-1">
            <h3 className="text-section">{current.title}</h3>
            <p className="text-label text-muted">{current.projectName}</p>
            {current.dueDate ? <p className="text-label tabular-nums">{current.dueDate}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                {t('previous')}
              </Button>
              <Button
                variant="secondary"
                disabled={index >= actions.length - 1}
                onClick={() => setIndex((value) => Math.min(actions.length - 1, value + 1))}
              >
                {t('next')}
              </Button>
            </div>

            <Button onClick={complete} disabled={pending}>
              {pending ? tCommon('loading') : t('done')}
            </Button>
          </div>

          <Button variant="ghost" onClick={onClose}>
            {t('exit')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-label">{t('finished')}</p>
          <Button onClick={onClose}>{t('exit')}</Button>
        </div>
      )}
    </Modal>
  )
}
