import { getTranslations } from 'next-intl/server'
import { SkeletonList } from '@/components/ui/skeleton'

export default async function AppLoading() {
  const t = await getTranslations('common')
  return <SkeletonList label={t('loading')} />
}
