import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { listActivity } from '@/modules/activity'
import { getClient, listClientContacts, listIndustries } from '@/modules/clients'
import { requirePageSession } from '@/server'
import { ClientDetail } from './client-detail'

export default async function ClientPage(props: {
  params: Promise<{ locale: string; clientId: string }>
}) {
  const { locale, clientId } = await props.params
  await requirePageSession(locale)

  const client = await getClient({ id: clientId })
  // 404 rather than 403: never confirm that a client exists in another tenant.
  if (!client) notFound()

  const [contacts, industries, activity] = await Promise.all([
    listClientContacts({ clientId }),
    listIndustries(),
    listActivity({ clientId, limit: 30 }),
  ])

  const t = await getTranslations('clients')

  return (
    <ClientDetail
      client={client}
      contacts={contacts}
      industries={industries}
      activity={activity.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      }))}
      locale={locale === 'en' ? 'en' : 'fr'}
      backLabel={t('title')}
    />
  )
}
