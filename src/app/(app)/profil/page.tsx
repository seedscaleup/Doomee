import { requireProfile } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { Notice } from '@/components/ui';
import { ProfileForm } from './ProfileForm';
import { signOut } from '@/app/login/actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: { reset?: string } }) {
  const profile = await requireProfile();
  const { t } = await getT();
  return (
    <>
      <h1 className="text-2xl font-extrabold">{t('profile.title')}</h1>
      {searchParams.reset && <Notice tone="brand">{t('profile.resetNotice')}</Notice>}
      <ProfileForm profile={profile} departmentName={profile.department?.name ?? null} />
      <form action={signOut}>
        <button type="submit" className="h-12 w-full rounded-2xl bg-bad-soft font-extrabold text-bad-text">{t('profile.signOut')}</button>
      </form>
    </>
  );
}
