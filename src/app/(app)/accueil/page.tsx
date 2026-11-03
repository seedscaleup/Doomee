import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchPlanForDay, fetchPlans } from '@/lib/queries';
import { formatDate, formatMinutes, formatTime, hourNow, lastWorkdays, todayISO } from '@/lib/dates';
import { Badge, Bar, Card, Empty, Ring, type Tone } from '@/components/ui';
import { IconArrowRight, IconCheck } from '@/components/Icons';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const profile = await requireProfile();
  const { t, lang } = await getT();
  const supabase = createClient();
  const today = todayISO();
  const plan = await fetchPlanForDay(supabase, profile.id, today);
  const days = lastWorkdays(5);
  const history = await fetchPlans(supabase, { userIds: [profile.id], from: days[0], to: today });

  const planned = plan?.actions.filter((a) => !a.is_unplanned) ?? [];
  const done = planned.filter((a) => a.result?.status === 'done').length;
  const partial = planned.filter((a) => a.result?.status === 'partial').length;
  const left = planned.length - done;
  const rate = planned.length ? Math.round((done / planned.length) * 100) : null;
  const est = planned.reduce((s, a) => s + (a.estimated_minutes || 0), 0);
  const real = (plan?.actions ?? []).reduce((s, a) => s + (a.result?.actual_minutes || 0), 0);
  const closedCount = history.filter((p) => p.status === 'closed').length;

  const h = hourNow();
  const greet = h < 12 ? t('home.morning') : h < 18 ? t('home.afternoon') : t('home.evening');
  const firstName = profile.first_name || profile.email.split('@')[0];

  const statusOf = (s: string | undefined): { tone: Tone; key: TKey } => {
    if (s === 'done') return { tone: 'ok', key: 'status.done' };
    if (s === 'partial') return { tone: 'warn', key: 'status.partial' };
    if (s === 'not_done') return { tone: 'bad', key: 'status.not_done' };
    return { tone: 'none', key: 'status.todo' };
  };

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-muted">{formatDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight">{greet} {firstName},<br />{t('home.yourDay')}</h1>
      </div>

      <section aria-label={t('home.moments')} className="grid grid-cols-2 gap-3">
        {plan && plan.status !== 'draft' ? (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-muted">{t('home.morningLabel')}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok text-white"><IconCheck size={14} /></span>
            </div>
            <span className="text-base font-extrabold">{t('home.planSubmitted')}</span>
            <span className="text-sm text-muted">{t('home.atCount', { time: formatTime(plan.submitted_at, lang), n: planned.length })}</span>
          </div>
        ) : (
          <Link href="/planning" className="flex flex-col gap-2.5 rounded-[20px] bg-brand p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold">{t('home.morningLabel')}</span>
              <IconArrowRight size={20} />
            </div>
            <span className="text-base font-extrabold">{t('home.doPlanning')}</span>
            <span className="text-sm text-[#3B3A2E]">{plan ? t('home.draftCount', { n: plan.actions.length }) : t('home.notStarted')}</span>
          </Link>
        )}
        {plan?.status === 'closed' ? (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-muted">{t('home.eveningLabel')}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok text-white"><IconCheck size={14} /></span>
            </div>
            <span className="text-base font-extrabold">{t('home.checkoutDone')}</span>
            <span className="text-sm text-muted">{t('home.at', { time: formatTime(plan.closed_at, lang) })}</span>
          </div>
        ) : plan?.status === 'submitted' ? (
          <Link href="/bilan" className="flex flex-col gap-2.5 rounded-[20px] bg-ink p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-brand">{t('home.eveningLabel')}</span>
              <IconArrowRight size={20} className="text-brand" />
            </div>
            <span className="text-base font-extrabold">{t('home.doCheckout')}</span>
            <span className="text-sm text-[#C9CACC]">{t('home.beforeEnd')}</span>
          </Link>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-white/60 p-4 text-muted">
            <span className="text-xs font-extrabold">{t('home.eveningLabel')}</span>
            <span className="text-base font-extrabold">{t('home.checkoutLocked')}</span>
            <span className="text-sm">{t('home.afterPlanning')}</span>
          </div>
        )}
      </section>

      <Card aria-label={t('home.progress')} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Ring value={rate} label={t('home.ringLabel')} />
          <div className="flex flex-col gap-1">
            <p className="text-lg font-extrabold leading-snug">
              {planned.length ? t('home.doneOf', { done, total: planned.length }) : t('home.noActions')}
            </p>
            {planned.length > 0 && <p className="text-sm text-muted">{t('home.leftDetail', { left, partial })}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col rounded-2xl bg-paper p-3"><span className="text-2xl font-extrabold">{planned.length}</span><span className="text-xs font-semibold text-muted">{t('home.planned')}</span></div>
          <div className="flex flex-col rounded-2xl bg-paper p-3"><span className="text-2xl font-extrabold text-ok-text">{done}</span><span className="text-xs font-semibold text-muted">{t('home.done')}</span></div>
          <div className="flex flex-col rounded-2xl bg-paper p-3"><span className="text-2xl font-extrabold text-warn-text">{left}</span><span className="text-xs font-semibold text-muted">{t('home.toFinish')}</span></div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm font-semibold"><span className="text-muted">{t('home.timeSpent')}</span><span>{formatMinutes(real)} / {formatMinutes(est)}</span></div>
          <Bar value={est ? (real / est) * 100 : 0} />
        </div>
      </Card>

      <section aria-label={t('home.today')} className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{t('home.today')}</h2>
          <Link href="/planning" className="py-2 text-sm font-bold underline">{t('home.seePlanning')}</Link>
        </div>
        {plan && plan.actions.length > 0 ? (
          plan.actions.map((a) => {
            const st = statusOf(a.result?.status);
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold">{a.title}</span>
                  <span className="text-sm text-muted">{[a.project?.name, a.category?.name, a.deadline?.slice(0, 5)].filter(Boolean).join(' · ')}</span>
                </div>
                {a.is_unplanned && <Badge tone="brand">{t('common.unplanned')}</Badge>}
                <Badge tone={st.tone}>{t(st.key)}</Badge>
              </div>
            );
          })
        ) : (
          <Empty>{t('home.emptyToday')}</Empty>
        )}
      </section>

      <section aria-label={t('home.history')} className="flex items-center gap-4 rounded-[20px] bg-brand-soft p-4">
        <div className="flex h-10 items-end gap-1" aria-hidden="true">
          {days.map((d) => {
            const p = history.find((x) => x.plan_date === d);
            const hgt = p?.status === 'closed' ? 40 : p ? 22 : 8;
            return <span key={d} className="w-2 rounded bg-ink" style={{ height: hgt }} />;
          })}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="font-extrabold">{t('home.historyCount', { n: closedCount, total: days.length })}</span>
          <Link href="/performance" className="text-sm font-semibold underline">{t('home.seePerformance')}</Link>
        </div>
      </section>
    </>
  );
}
