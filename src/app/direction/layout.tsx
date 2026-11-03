import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { fullName, initials } from '@/lib/queries';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { SideNav } from './SideNav';
import type { TKey } from '@/lib/i18n';

export default async function DirectionLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const { t } = await getT();
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex max-w-full flex-[1_1_250px] flex-col gap-7 px-5 py-7 lg:max-w-[280px]">
        <Link href="/direction"><Logo size={36} /></Link>
        <SideNav isAdmin={profile.role === 'admin'} />
        <Link href="/profil" className="flex items-center gap-3 rounded-[18px] bg-white p-3.5">
          <Avatar url={profile.avatar_url} color={profile.avatar_color} text={initials(profile)} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-extrabold">{fullName(profile)}</span>
            <span className="text-xs font-semibold text-muted">{t(`role.${profile.role}` as TKey)}</span>
          </span>
        </Link>
      </aside>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 pb-12 pt-7 md:px-8">{children}</main>
    </div>
  );
}
