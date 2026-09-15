import { getTranslations } from 'next-intl/server'
import { listMyActions } from '@/modules/actions'
import { requirePageSession } from '@/server'
import { MyWorkScreen } from './my-work-screen'

export default async function MyWorkPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  await requirePageSession(locale)

  const rows = await listMyActions()
  const t = await getTranslations('myWork')

  return <MyWorkScreen rows={rows} labels={{ title: t('title'), description: t('description') }} />
}
