import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchPlans, fullName } from '@/lib/queries';
import { computeMetrics } from '@/lib/metrics';
import { formatShort, normalizePeriod, periodRange, todayISO, workdaysBetween, lastWorkdays, formatDate } from '@/lib/dates';
import { Card, SectionTitle, Tabs, btnPrimary } from '@/components/ui';
import { DayList, KpiGrid, TimeByProject, Difficulties } from '@/components/report';
import { RateChart } from '@/components/Charts';
import { IconDownload, IconLock } from '@/components/Icons';

export const dynamic = 'force-dynamic';

export default async function PerformancePage({ searchParams }: { searchParams: { p?: string } }) {
  const profile = await requireProfile();
  const { t, lang } = await getT();
  const supabase = createClient();
  const period = normalizePeriod(searchParams.p);
  const today = todayISO();
  const { from, to } = periodRange(period, today);
  const expected = workdaysBetween(from, to);

  const chartDays = lastWorkdays(10, today);
  const [plans, chartPlans, { data: observations }] = await Promise.all([
    fetchPlans(supabase, { userIds: [profile.id], from, to }),
    fetchPlans(supabase, { userIds: [profile.id], from: chartDays[0], to: today }),
    supabase.from('manager_observations').select('id, body, created_at, author_name').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5)
  ]);
  const m = computeMetrics(plans, expected.length);
  const chart = chartDays.map((d) => {
    const p = chartPlans.find((x) => x.plan_date === d);
    return { label: formatShort(d, lang), rate: p ? computeMetrics([p], 1).rate : null };
  });

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{t('perf.title')}</h1>
          <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><IconLock size={14} />{t('perf.private')}</span>
        </div>
        <Tabs items={(['day', 'week', 'month'] as const).map((k) => ({ href: `/performance?p=${k}`, label: t(`period.${k}`), active: period === k }))} />
        <p className="text-sm font-semibold text-muted">{from === to ? formatDate(from, lang) : t('common.fromTo', { from: formatShort(from, lang), to: formatShort(to, lang) })}</p>
        <a href={`/api/rapport?user=${profile.id}&from=${from}&to=${to}`} className={btnPrimary}>
          <IconDownload size={18} />{t('perf.download')}
        </a>
      </div>

      <KpiGrid m={m} t={t} />

      <Card>
        <SectionTitle>{t('perf.trend')}</SectionTitle>
        <RateChart data={chart} label={t('report.rate')} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>{t('report.timeByProject')}</SectionTitle>
          <TimeByProject plans={plans} t={t} />
        </Card>
        <Card>
          <SectionTitle>{t('report.difficulties')}</SectionTitle>
          <Difficulties plans={plans} t={t} />
        </Card>
      </div>

      {observations && observations.length > 0 && (
        <Card>
          <SectionTitle>{t('report.observations')}</SectionTitle>
          <div className="flex flex-col gap-2">
            {observations.map((o) => (
              <div key={o.id} className="rounded-2xl bg-paper p-3">
                <p className="text-xs font-extrabold text-muted">{o.author_name ?? t('report.manager')} · {formatShort(o.created_at.slice(0, 10), lang)}</p>
                <p className="mt-1 text-sm leading-relaxed">{o.body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section aria-label={t('perf.history')}>
        <SectionTitle>{t('perf.history')}</SectionTitle>
        <DayList plans={plans} expectedDays={expected} t={t} lang={lang} />
      </section>
      <p className="text-xs text-muted">{t('common.dataNote')} · {fullName(profile)}</p>
    </>
  );
}
