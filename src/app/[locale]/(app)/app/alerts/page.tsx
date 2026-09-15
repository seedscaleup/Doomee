import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { listAlerts } from '@/modules/health'
import type { AlertKind, AlertRow } from '@/modules/health/types'
import { requirePageSession } from '@/server'

const KINDS: readonly AlertKind[] = [
  'overdue_action',
  'pending_validation',
  'project_at_risk',
  'objective_behind',
]

/**
 * ============================================================================
 * THE ALERT CENTRE.
 *
 * Four kinds, each one a thing somebody has to do something about today.
 *
 * Deliberately NOT a feed. A feed of everything that happened is read once and
 * then ignored; a list of four things that need a decision is a list people
 * come back to. Every line links to the place where the decision gets made
 * (*Every action leads somewhere*).
 * ============================================================================
 */
export default async function AlertsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)

  const alerts = await listAlerts()
  const t = await getTranslations('alerts')

  const byKind = new Map<AlertKind, AlertRow[]>()
  for (const alert of alerts) {
    byKind.set(alert.kind, [...(byKind.get(alert.kind) ?? []), alert])
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {alerts.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyHint')} />
      ) : (
        KINDS.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0).map((kind) => (
          <section key={kind} className="flex flex-col gap-3">
            <h2 className="flex flex-wrap items-center gap-2 text-section">
              {t(`kind.${kind}`)}
              <StatusBadge
                label={t('count', { count: byKind.get(kind)?.length ?? 0 })}
                tone={toneFor(kind)}
              />
            </h2>

            <ul className="flex flex-col gap-2">
              {(byKind.get(kind) ?? []).map((alert) => (
                <li key={`${alert.kind}-${alert.id}`}>
                  <Link
                    href={alert.href as '/app'}
                    className="flex min-h-touch flex-col gap-0.5 rounded-doomee border border-border bg-surface px-3 py-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{alert.title}</span>
                      <span className="text-caption text-subtle">{alert.projectName}</span>
                    </span>
                    <span className="text-caption text-muted">
                      {t(`line.${alert.kind}`, alert.params)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}

/**
 * The tone per kind.
 *
 * Nothing here is yellow: yellow is the colour of the one action to take on a
 * screen (rule 9), and a page made entirely of yellow badges points at nothing.
 */
function toneFor(kind: AlertKind): 'danger' | 'warning' {
  return kind === 'overdue_action' || kind === 'project_at_risk' ? 'danger' : 'warning'
}
