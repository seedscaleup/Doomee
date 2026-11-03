import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchPlans } from '@/lib/queries';
import { addDays, formatDate, formatMinutes, formatMoney, formatTime, todayISO } from '@/lib/dates';
import { Badge, Empty, Notice, btnPrimary, type Tone } from '@/components/ui';
import { BilanClient } from './BilanClient';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function BilanPage() {
  const profile = await requireProfile();
  const { t, lang } = await getT();
  const supabase = createClient();
  const today = todayISO();
  // Bilan du jour, ou d'un jour récent resté ouvert
  const plans = await fetchPlans(supabase, { userIds: [profile.id], from: addDays(today, -3), to: today });
  const open = plans.find((p) => p.status === 'submitted');
  const todayPlan = plans.find((p) => p.plan_date === today);
  const plan = open ?? todayPlan;

  const [{ data: projects }, { data: categories }] = await Promise.all([
    supabase.from('projects').select('id, name').in('status', ['active', 'draft']).order('name'),
    supabase.from('categories').select('id, name').eq('active', true).order('sort_order')
  ]);

  const tone = (s?: string): Tone => (s === 'done' ? 'ok' : s === 'partial' ? 'warn' : s === 'not_done' ? 'bad' : 'none');

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('checkout.kicker')} · {plan ? formatDate(plan.plan_date, lang, { weekday: 'short', day: 'numeric', month: 'short' }) : ''}</p>
          <h1 className="text-2xl font-extrabold">{t('checkout.title')}</h1>
        </div>
      </div>

      {!plan || plan.status === 'draft' ? (
        <>
          <Empty>{t('checkout.needPlanning')}</Empty>
          <Link href="/planning" className={btnPrimary}>{t('checkout.goPlanning')}</Link>
        </>
      ) : plan.status === 'closed' ? (
        <>
          <Notice tone="ok">{t('checkout.closedAt', { time: formatTime(plan.closed_at, lang) })}</Notice>
          {plan.actions.map((a) => (
            <article key={a.id} className="flex flex-col gap-1.5 rounded-[20px] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{a.title}</span>
                <Badge tone={tone(a.result?.status)}>{a.result ? t(`status.${a.result.status}` as TKey) : '—'}</Badge>
              </div>
              {a.result?.actual_result && <span className="text-sm">{a.result.actual_result}</span>}
              <span className="text-sm text-muted">
                {formatMinutes(a.result?.actual_minutes ?? 0)}
                {a.result?.budget_used ? ` · ${formatMoney(a.result.budget_used)}` : ''}
              </span>
              {a.result?.justification && <span className="text-sm text-muted">{a.result.justification}</span>}
            </article>
          ))}
          <p className="text-sm text-muted">{t('checkout.lockedHelp')}</p>
        </>
      ) : (
        <>
          {plan.plan_date !== today && <Notice tone="warn">{t('checkout.lateDay', { date: formatDate(plan.plan_date, lang) })}</Notice>}
          <BilanClient plan={plan} userId={profile.id} projects={projects ?? []} categories={categories ?? []} />
        </>
      )}
    </>
  );
}
