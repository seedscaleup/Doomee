'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
  type TimelineEntry,
} from '@/components/patterns'
import { Button } from '@/components/ui/field'
import { Link, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { archiveClient } from '@/modules/clients/mutations'
import { statusTone } from '@/modules/clients/service'
import type { ContactRow, IndustryOption } from '@/modules/clients/types'
import { ClientFormSheet } from '../client-form-sheet'
import { ContactsPanel } from './contacts-panel'
import { LogoPanel } from './logo-panel'

type ClientDetailData = {
  id: string
  name: string
  status: 'prospect' | 'active' | 'paused' | 'archived'
  description: string | null
  website: string | null
  email: string | null
  phone: string | null
  address: string | null
  industryId: string | null
  industryLabels: Record<string, string> | null
  ownerName: string | null
  accountTeamNote: string | null
  logoUrl: string | null
}

type ActivityEntry = {
  id: string
  verb: string
  actorName: string | null
  params: Record<string, unknown>
  createdAt: string
}

const TABS = ['overview', 'contacts', 'activity'] as const
type Tab = (typeof TABS)[number]

export function ClientDetail({
  client,
  contacts,
  industries,
  activity,
  locale,
  backLabel,
}: {
  client: ClientDetailData
  contacts: ContactRow[]
  industries: IndustryOption[]
  activity: ActivityEntry[]
  locale: Locale
  backLabel: string
}) {
  const t = useTranslations('clients')
  const tStatus = useTranslations('status.client')
  const tActivity = useTranslations('activity')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const entries: TimelineEntry[] = activity.map((entry) => ({
    id: entry.id,
    // The verb plus its parameters becomes a sentence in the READER's language
    // (ADR-011): the same row reads differently for a French and an English
    // colleague, which is the whole point of not storing the text.
    content: tActivity(entry.verb, {
      actor: entry.actorName ?? tActivity('unknownActor'),
      name: String(entry.params.name ?? client.name),
    }),
    timestamp: format.dateTime(new Date(entry.createdAt), {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  }))

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/app/clients"
        className="w-fit text-label text-muted underline underline-offset-4"
      >
        {backLabel}
      </Link>

      <PageHeader
        title={client.name}
        description={client.description ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {tCommon('save')}
            </Button>
            {client.status !== 'archived' ? (
              <Button variant="ghost" onClick={() => setArchiving(true)}>
                {t('archive.action')}
              </Button>
            ) : null}
          </div>
        }
      />

      <StatusBadge label={tStatus(client.status)} tone={statusTone(client.status)} />

      <Tabs
        tabs={TABS.map((name) => ({ key: name, label: t(`tabs.${name}`) }))}
        active={tab}
        onSelect={setTab}
        label={client.name}
      />

      {tab === 'overview' ? (
        <div className="flex flex-col gap-6">
          <LogoPanel clientId={client.id} name={client.name} logoUrl={client.logoUrl} />

          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label={t('form.industry')} value={client.industryLabels?.[locale]} />
            <Detail label={t('form.owner')} value={client.ownerName} />
            <Detail label={t('form.email')} value={client.email} />
            <Detail label={t('form.phone')} value={client.phone} />
            <Detail label={t('form.website')} value={client.website} />
            <Detail label={t('form.address')} value={client.address} />
            {/* Internal note, on an internal screen. The portal views do not
                select this column at all, so it cannot leak by accident. */}
            <Detail label={t('form.accountTeamNote')} value={client.accountTeamNote} />
          </dl>
        </div>
      ) : null}

      {tab === 'contacts' ? <ContactsPanel clientId={client.id} contacts={contacts} /> : null}

      {tab === 'activity' ? (
        entries.length > 0 ? (
          <Timeline entries={entries} />
        ) : (
          <EmptyState
            title={t('activity.emptyTitle')}
            description={t('activity.emptyDescription')}
          />
        )
      ) : null}

      <ClientFormSheet
        open={editing}
        client={client}
        industries={industries}
        locale={locale}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={archiving}
        title={t('archive.title')}
        description={t('archive.description')}
        confirmLabel={t('archive.confirm')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          await archiveClient({ id: client.id })
          setArchiving(false)
          router.refresh()
        }}
        onCancel={() => setArchiving(false)}
      />
    </section>
  )
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-label">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  )
}
