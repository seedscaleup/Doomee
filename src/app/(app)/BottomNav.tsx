'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { IconChart, IconGrid, IconHome, IconMoon, IconSun } from '@/components/Icons';

export function BottomNav({ staff }: { staff: boolean }) {
  const path = usePathname();
  const { t } = useI18n();
  const items = [
    { href: '/accueil', label: t('nav.home'), Icon: IconHome },
    { href: '/planning', label: t('nav.planning'), Icon: IconSun },
    { href: '/bilan', label: t('nav.checkout'), Icon: IconMoon },
    { href: '/performance', label: t('nav.stats'), Icon: IconChart },
    ...(staff ? [{ href: '/direction', label: t('nav.directionShort'), Icon: IconGrid }] : [])
  ];
  return (
    <nav aria-label={t('nav.main')} className="no-print fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl rounded-[26px] bg-ink p-2"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 4 }}>
      {items.map(({ href, label, Icon }) => {
        const active = path === href || path.startsWith(href + '/');
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-bold ${active ? 'bg-brand text-ink' : 'text-white'}`}>
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
