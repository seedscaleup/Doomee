import { getTranslations } from 'next-intl/server'
import { listClients, listIndustries } from '@/modules/clients'
import { requirePageSession } from '@/server'
import { ClientsScreen } from './clients-screen'

export default async function ClientsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)

  const [rows, industries] = await Promise.all([listClients({}), listIndustries()])
  const t = await getTranslations('clients')

  return (
    <ClientsScreen
      rows={rows}
      industries={industries}
      locale={locale === 'en' ? 'en' : 'fr'}
      labels={{ title: t('title'), description: t('description') }}
    />
  )
}
