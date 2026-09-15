'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/patterns'
import { Alert, Button, Field, Select, TextInput } from '@/components/ui/field'
import { createShare, revokeShare } from '@/modules/reports/mutations'
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS } from '@/modules/reports/service'
import type { ShareRow } from '@/modules/reports/types'

const DAY_CHOICES = [7, 14, 30, MAX_SHARE_DAYS] as const

/**
 * One link in the list.
 *
 * Its own component because "what state is this link in" is three questions —
 * revoked, expired, or live — and answering them inline made the panel hard to
 * read for anyone wondering which one a reader is being shown.
 */
function ShareLine({ share, onRevoke }: { share: ShareRow; onRevoke: () => void }) {
  const t = useTranslations('reports.share')
  const format = useFormatter()
  const expired = new Date(share.expiresAt).getTime() <= Date.now()

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-2">
      <div className="flex flex-col">
        <span className="text-label">
          {t('expiresOn', {
            date: format.dateTime(new Date(share.expiresAt), { dateStyle: 'medium' }),
          })}
        </span>
        <span className="text-caption text-muted">
          {share.recipientEmail ? `${share.recipientEmail} · ` : ''}
          {share.viewCount === 0 ? t('never') : t('views', { count: share.viewCount })}
          {share.hasPassword ? ` · ${t('withPassword')}` : ''}
        </span>
      </div>

      {share.revokedAt ? (
        <StatusBadge label={t('revoked')} tone="neutral" />
      ) : expired ? (
        <StatusBadge label={t('expired')} tone="neutral" />
      ) : (
        <Button variant="ghost" onClick={onRevoke}>
          {t('revoke')}
        </Button>
      )}
    </li>
  )
}

/**
 * ============================================================================
 * SHARE LINKS.
 *
 * The token is shown ONCE, at creation, and never again — the database stores
 * only its hash, exactly as it stores only a hash of a password. A leaked
 * backup must not hand out live links, and a list that could redisplay them
 * would make the hash decorative.
 *
 * So the screen says so in the same breath as it shows the link, rather than
 * letting someone discover it by coming back tomorrow.
 * ============================================================================
 */
export function SharePanel({
  reportId,
  shares,
  shareable,
  onChanged,
}: {
  reportId: string
  shares: ShareRow[]
  shareable: boolean
  onChanged: () => void
}) {
  const t = useTranslations('reports.share')
  const tCommon = useTranslations('common')
  const _format = useFormatter()
  const [pending, startTransition] = useTransition()

  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  function create(form: FormData) {
    setError(null)
    setCopied(false)

    startTransition(async () => {
      try {
        const password = String(form.get('password') ?? '').trim()
        const recipient = String(form.get('recipient') ?? '').trim()

        const created = await createShare({
          reportId,
          expiresInDays: Number(form.get('expiresInDays')) || DEFAULT_SHARE_DAYS,
          password: password === '' ? undefined : password,
          recipientEmail: recipient === '' ? undefined : recipient,
        })

        setToken(`${window.location.origin}/share/${created.token}`)
        onChanged()
      } catch {
        setError(t('failed'))
      }
    })
  }

  return (
    <section className="flex flex-col gap-4 rounded-doomee border border-border bg-surface p-4">
      <header>
        <h2 className="text-section font-semibold">{t('title')}</h2>
        <p className="text-caption text-muted">{t('description')}</p>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {!shareable ? (
        <Alert tone="warning">{t('requiresPublished')}</Alert>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            create(new FormData(event.currentTarget))
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('expiresIn')}>
              {({ id }) => (
                <Select id={id} name="expiresInDays" defaultValue={String(DEFAULT_SHARE_DAYS)}>
                  {DAY_CHOICES.map((days) => (
                    <option key={days} value={days}>
                      {t('days', { count: days })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t('password')} hint={t('passwordHint')}>
              {({ id }) => (
                <TextInput id={id} name="password" type="password" minLength={6} maxLength={200} />
              )}
            </Field>

            <Field label={t('recipient')}>
              {({ id }) => <TextInput id={id} name="recipient" type="email" maxLength={320} />}
            </Field>
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {t('create')}
            </Button>
          </div>
        </form>
      )}

      {token ? (
        <div className="flex flex-col gap-2 rounded-doomee border border-warning/30 bg-warning-soft p-3">
          <p className="text-label text-warning-text">{t('onlyOnce')}</p>
          <code className="overflow-x-auto whitespace-nowrap text-caption">{token}</code>
          <div>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(token)
                setCopied(true)
              }}
            >
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
        </div>
      ) : null}

      {shares.length === 0 ? (
        <p className="text-caption text-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shares.map((share) => (
            <ShareLine key={share.id} share={share} onRevoke={() => setRevoking(share.id)} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={revoking !== null}
        title={t('revokeConfirm')}
        description={t('revokeDescription')}
        confirmLabel={t('revoke')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (!revoking) return
          try {
            await revokeShare({ id: revoking })
            onChanged()
          } catch {
            setError(t('failed'))
          } finally {
            setRevoking(null)
          }
        }}
        onCancel={() => setRevoking(null)}
      />
    </section>
  )
}
