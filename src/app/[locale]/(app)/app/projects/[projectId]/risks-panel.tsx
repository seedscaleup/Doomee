'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/patterns'
import { Alert, Button } from '@/components/ui/field'
import { useRouter } from '@/i18n/navigation'
import { deleteRisk } from '@/modules/health/mutations'
// The barrel is a SERVER entrypoint (ADR-030): take the pure service instead.
import { riskTone } from '@/modules/health/service'
import type { PersonOption, RiskRow } from '@/modules/health/types'
import { RiskFormSheet } from './risk-form-sheet'

/**
 * The risk register, on the project it belongs to.
 *
 * Contextual on purpose: a risk is written down at the moment somebody notices
 * it, and that moment happens on the project screen — not on a register that
 * has to be remembered.
 */
export function RisksPanel({
  projectId,
  risks,
  people,
  canCreate,
  canUpdate,
}: {
  projectId: string
  risks: RiskRow[]
  people: PersonOption[]
  /** Hiding is a courtesy, not the control: the gateway refuses either way. */
  canCreate: boolean
  canUpdate: boolean
}) {
  const t = useTranslations('risks')
  const tLevel = useTranslations('riskLevel')
  const tStatus = useTranslations('status.risk')
  const tKind = useTranslations('risks.kind')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RiskRow | null>(null)
  const [deleting, setDeleting] = useState<RiskRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canCreate ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>{t('new')}</Button>
        </div>
      ) : null}

      {risks.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {risks.map((risk) => (
            <li
              key={risk.id}
              className="flex flex-col gap-2 rounded-doomee border border-border bg-surface px-4 py-3"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{risk.title}</span>
                {/* Level is a badge, not coloured text: orange is never the
                    sole carrier of meaning (CLAUDE.md §9). */}
                <StatusBadge label={tLevel(risk.level)} tone={riskTone(risk.level)} />
                <StatusBadge label={tStatus(risk.status)} tone="neutral" />
                <span className="text-caption text-subtle">{tKind(risk.kind)}</span>
                {risk.isClientVisible ? (
                  <StatusBadge label={t('form.isClientVisible')} tone="progress" />
                ) : null}
              </span>

              {risk.description ? (
                <p className="text-label text-muted">{risk.description}</p>
              ) : null}
              {risk.mitigationPlan ? (
                <p className="text-label">
                  <span className="text-caption uppercase tracking-wide text-subtle">
                    {t('form.mitigationPlan')}
                  </span>
                  <br />
                  {risk.mitigationPlan}
                </p>
              ) : null}

              <span className="flex flex-wrap items-center gap-2">
                {risk.ownerName ? (
                  <span className="text-caption text-subtle">{risk.ownerName}</span>
                ) : null}
                {canUpdate ? (
                  <span className="ml-auto flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing(risk)}>
                      {t('form.editTitle')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleting(risk)}>
                      {t('delete.action')}
                    </Button>
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <RiskFormSheet
        open={(creating || editing !== null) && (canCreate || canUpdate)}
        projectId={projectId}
        risk={editing ?? undefined}
        people={people}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (!deleting) return
          setError(null)
          try {
            await deleteRisk({ id: deleting.id })
            router.refresh()
          } catch {
            setError(t('form.failed'))
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
