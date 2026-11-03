import Link from 'next/link';
import { requireProfile, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { initials } from '@/lib/queries';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { IconBell, IconGrid } from '@/components/Icons';
import { BottomNav } from './BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const { t } = await getT();
  const supabase = createClient();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('read_at', null);
  const unread = count ?? 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
        <Link href="/accueil" aria-label="DOOMEE"><Logo size={30} /></Link>
        <div className="flex items-center gap-2">
          {isStaff(profile) && (
            <Link href="/direction" className="hidden h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold sm:inline-flex">
              <IconGrid size={18} />{t('nav.direction')}
            </Link>
          )}
          <Link href="/notifications" aria-label={t('notif.aria', { n: unread })} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white">
            <IconBell />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-extrabold text-white">{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
          <Link href="/profil" aria-label={t('nav.profile')} className="rounded-full">
            <Avatar url={profile.avatar_url} color={profile.avatar_color} text={initials(profile)} />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-32 pt-2">{children}</main>
      <BottomNav staff={isStaff(profile)} />
    </div>
  );
}
