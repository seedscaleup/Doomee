'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { IconChart, IconFile, IconFolder, IconGrid, IconHome, IconSettings, IconUsers } from '@/components/Icons';

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const { t } = useI18n();
  const items = [
    { href: '/direction', label: t('dnav.overview'), Icon: IconGrid, exact: true },
    { href: '/direction/equipe', label: t('dnav.team'), Icon: IconChart },
    { href: '/direction/rapports', label: t('dnav.reports'), Icon: IconFile },
    { href: '/direction/projets', label: t('dnav.projects'), Icon: IconFolder },
    ...(isAdmin
      ? [
          { href: '/direction/utilisateurs', label: t('dnav.users'), Icon: IconUsers },
          { href: '/direction/parametres', label: t('dnav.settings'), Icon: IconSettings }
        ]
      : []),
    { href: '/accueil', label: t('dnav.mySpace'), Icon: IconHome }
  ];
  return (
    <nav aria-label={t('dnav.label')} className="flex flex-wrap gap-1 lg:flex-col">
      {items.map(({ href, label, Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href) || (href === '/direction/equipe' && path.startsWith('/direction/collaborateurs'));
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3.5 text-[15px] font-bold ${active ? 'bg-ink text-white' : 'hover:bg-white'}`}>
            <Icon size={18} className={active ? 'text-brand' : ''} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
