import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchPlanForDay } from '@/lib/queries';
import { formatDate, formatMinutes, formatMoney, formatTime, todayISO } from '@/lib/dates';
import { Badge, Notice, btnPrimary } from '@/components/ui';
import { PlanningClient } from './PlanningClient';

export const dynamic = 'force-dynamic';

export default async function PlanningPage() {
  const profile = await requireProfile();
  const { t, lang } = await getT();
  const supabase = createClient();
  const today = todayISO();
  const [plan, { data: projects }, { data: categories }] = await Promise.all([
    fetchPlanForDay(supabase, profile.id, today),
    supabase.from('projects').select('id, name').in('status', ['active', 'draft']).order('name'),
    supabase.from('categories').select('id, name').eq('active', true).order('sort_order')
  ]);
  const locked = plan && plan.status !== 'draft';

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('planning.kicker')} · {formatDate(today, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <h1 className="text-2xl font-extrabold">{t('planning.title')}</h1>
        </div>
        <Badge tone={locked ? 'ok' : 'none'}>{locked ? t('planning.submittedBadge') : t('planning.draftBadge')}</Badge>
      </div>

      {locked ? (
        <>
          <Notice tone="ok">{t('planning.submittedAt', { time: formatTime(plan!.submitted_at, lang) })}</Notice>
          {plan!.actions.map((a) => (
            <article key={a.id} className="flex flex-col gap-2 rounded-[20px] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{a.title}</span>
                {a.is_unplanned && <Badge tone="brand">{t('common.unplanned')}</Badge>}
              </div>
              {a.expected_result && <span className="text-sm text-muted">{t('planning.expected')} : {a.expected_result}</span>}
              <div className="flex flex-wrap gap-1.5">
                {a.project && <Badge>{a.project.name}</Badge>}
                <Badge>{formatMinutes(a.estimated_minutes)}</Badge>
                {a.planned_budget ? <Badge tone="brand">{formatMoney(a.planned_budget)}</Badge> : null}
              </div>
            </article>
          ))}
          {plan!.status === 'submitted' && <Link href="/bilan" className={btnPrimary}>{t('planning.goCheckout')}</Link>}
        </>
      ) : (
        <PlanningClient actions={plan?.actions ?? []} projects={projects ?? []} categories={categories ?? []} />
      )}
    </>
  );
}
