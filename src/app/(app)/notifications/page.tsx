import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { formatShort, formatTime, todayISO } from '@/lib/dates';
import { Empty, Tabs } from '@/components/ui';
import { markRead } from './actions';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, { letter: string; cls: string }> = {
  reminder: { letter: 'R', cls: 'bg-ink text-brand' },
  late: { letter: '!', cls: 'bg-bad-soft text-bad-text' },
  observation: { letter: 'M', cls: 'bg-brand text-ink' },
  report: { letter: 'B', cls: 'bg-ok-soft text-ok-text' }
};

export default async function NotificationsPage({ searchParams }: { searchParams: { f?: string } }) {
  const profile = await requireProfile();
  const { t, lang } = await getT();
  const supabase = createClient();
  const onlyUnread = searchParams.f === 'unread';
  let q = supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(60);
  if (onlyUnread) q = q.is('read_at', null);
  const { data: items } = await q;
  const today = todayISO();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('notif.title')}</h1>
        <form action={markRead}>
          <button type="submit" className="min-h-11 text-sm font-extrabold underline">{t('notif.readAll')}</button>
        </form>
      </div>
      <Tabs items={[
        { href: '/notifications', label: t('notif.all'), active: !onlyUnread },
        { href: '/notifications?f=unread', label: t('notif.unread'), active: onlyUnread }
      ]} />
      {!items?.length ? (
        <Empty>{onlyUnread ? t('notif.emptyUnread') : t('notif.empty')}</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((n) => {
            const ic = ICONS[n.type] ?? { letter: 'D', cls: 'bg-paper text-ink' };
            const day = String(n.created_at).slice(0, 10);
            return (
              <article key={n.id} className={`flex items-start gap-3 rounded-[18px] p-4 ${n.read_at ? 'bg-[#ECECE7]' : 'bg-white'}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-sm font-extrabold ${ic.cls}`} aria-hidden="true">{ic.letter}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-extrabold">{n.title}</span>
                    <span className="whitespace-nowrap text-xs font-bold text-muted">{day === today ? formatTime(n.created_at, lang) : formatShort(day, lang)}</span>
                  </div>
                  {n.message && <p className="text-sm leading-relaxed text-[#3C4043]">{n.message}</p>}
                  <div className="flex items-center gap-4">
                    {n.link && <Link href={n.link} className="py-1 text-sm font-extrabold underline">{t('notif.open')}</Link>}
                    {!n.read_at && (
                      <form action={markRead}>
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="min-h-9 text-sm font-bold text-muted">{t('notif.markRead')}</button>
                      </form>
                    )}
                  </div>
                </div>
                {!n.read_at && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-bad" aria-label={t('notif.unreadOne')} />}
              </article>
            );
          })}
        </div>
      )}
      <Link href="/profil" className="py-2 text-center text-sm font-bold underline">{t('notif.settings')}</Link>
    </>
  );
}
