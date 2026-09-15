import { getFormatter, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/patterns'
import { Link } from '@/i18n/navigation'
import { statusTone } from '@/modules/deliverables/service'
import type { DeliverableStatusValue } from '@/modules/deliverables/types'
import { listPortalDeliverables } from '@/modules/portal'
import { requirePortalPageSession } from '@/server'

export default async function PortalDeliverablesPage(props: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params
  await requirePortalPageSession(locale)

  const rows = await listPortalDeliverables({})
  const t = await getTranslations('portal.deliverables')
  const tStatus = await getTranslations('status.deliverable')
  const format = await getFormatter()

  // What needs the client first, first. An inbox sorted by date buries the one
  // thing they opened the portal for.
  const sorted = [...rows].sort((a, b) => {
    const waiting = (row: (typeof rows)[number]) => (row.status === 'client_review' ? 0 : 1)
    return waiting(a) - waiting(b)
  })

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {sorted.length === 0 ? (
        <EmptyState title={t('title')} description={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((row) => (
            <li key={row.id}>
              <Link
                href={`/portal/deliverables/${row.id}` as '/portal'}
                className="flex min-h-touch flex-col gap-1 rounded-doomee border border-border bg-surface px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.title}</span>
                  <StatusBadge
                    label={tStatus(row.status as DeliverableStatusValue)}
                    tone={statusTone(row.status as DeliverableStatusValue)}
                  />
                </span>
                <span className="flex flex-wrap items-center gap-2 text-caption text-subtle">
                  <span>{row.projectName}</span>
                  <span>
                    {row.version === null ? t('noVersion') : t('version', { version: row.version })}
                  </span>
                  {row.sentToClientAt ? (
                    <span>
                      {t('sentOn', {
                        date: format.dateTime(new Date(row.sentToClientAt), {
                          dateStyle: 'short',
                        }),
                      })}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
