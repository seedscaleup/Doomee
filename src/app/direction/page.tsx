import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { loadTeam } from '@/lib/team';
import { computeMetrics, groupBy, rateTone } from '@/lib/metrics';
import { fetchPlans, fullName, initials } from '@/lib/queries';
import { formatDate, formatShort, lastWorkdays, normalizePeriod, periodRange, previousRange, todayISO, isWeekday } from '@/lib/dates';
import { Avatar, Badge, Bar, Card, Empty, SectionTitle, Stat, Tabs, btnBrand } from '@/components/ui';
import { Difficulties } from '@/components/report';
import { RateChart } from '@/components/Charts';
import { IconDownload } from '@/components/Icons';
import { remind } from './actions';

export const dynamic = 'force-dynamic';

export default async function DirectionHome({ searchParams }: { searchParams: { p?: string } }) {
  await requireStaff();
  const { t, lang } = await getT();
  const supabase = createClient();
  const period = normalizePeriod(searchParams.p);
  const today = todayISO();
  const { from, to } = periodRange(period, today);
  const team = await loadTeam(supabase, from, to);
  const g = team.global;

  // Comparaison avec la période précédente (mêmes collaborateurs visibles, mêmes règles de calcul)
  const prevRange = previousRange(period, from, to);
  const prev = (await loadTeam(supabase, prevRange.from, prevRange.to)).global;
  const prevLabel = t(`dir.prev.${period}`);
  const delta = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const fmtDelta = (d: number | null) => (d == null ? '—' : `${d > 0 ? '+' : ''}${d}`);
  const rateDelta = delta(g.rate, prev.rate);
  const compareRows = [
    { label: t('report.rate'), cur: g.rate, prev: prev.rate, unit: ' %', goodWhenUp: true },
    { label: t('report.onTime'), cur: g.onTimeRate, prev: prev.onTimeRate, unit: ' %', goodWhenUp: true },
    { label: t('report.reports'), cur: g.reportingRate, prev: prev.reportingRate, unit: ' %', goodWhenUp: true },
    { label: t('dir.late'), cur: g.late, prev: prev.planned || prev.bilansSubmitted ? prev.late : null, unit: '', goodWhenUp: false }
  ];

  // Tendance : 10 derniers jours ouvrés
  const days = lastWorkdays(10, today);
  const trendPlans = await fetchPlans(supabase, { userIds: team.profiles.map((p) => p.id), from: days[0], to: today });
  const byDay = groupBy(trendPlans, (p) => p.plan_date);
  const trend = days.map((d) => ({ label: formatShort(d, lang), rate: computeMetrics(byDay[d] ?? [], team.profiles.length).rate }));

  // Bilans manquants aujourd'hui
  const todayPlans = new Map((byDay[today] ?? []).map((p) => [p.user_id, p]));
  const missing = isWeekday(today) ? team.profiles.filter((p) => todayPlans.get(p.id)?.status !== 'closed') : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">{from === to ? formatDate(from, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('common.fromTo', { from: formatShort(from, lang), to: formatShort(to, lang) })}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('dir.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs items={(['day', 'week', 'month'] as const).map((k) => ({ href: `/direction?p=${k}`, label: t(`period.${k}`), active: period === k }))} />
          <a href={`/api/rapport?scope=team&from=${from}&to=${to}`} className={btnBrand}><IconDownload size={16} />{t('common.exportPdf')}</a>
        </div>
      </div>

      <section aria-label={t('dir.overview')} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat dark label={t('report.rate')} value={g.rate == null ? '—' : `${g.rate} %`} sub={<>{t('report.doneOf', { done: g.done, total: g.planned })}<br />{rateDelta == null ? t('dir.vsPrevNone', { label: prevLabel }) : t('dir.vsPrev', { delta: fmtDelta(rateDelta), label: prevLabel })}</>} />
        <Stat label={t('dir.active')} value={team.profiles.length} sub={t('dir.departments', { n: team.departments.length })} />
        <div className="flex flex-col gap-2 rounded-card bg-white p-5">
          <span className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('dir.plansSubmitted')}</span>
          <span className="text-3xl font-extrabold leading-none">{g.plansSubmitted}<span className="text-lg text-muted"> / {g.expectedDays}</span></span>
          <Bar value={g.expectedDays ? (g.plansSubmitted / g.expectedDays) * 100 : 0} tone="ok" />
        </div>
        <div className="flex flex-col gap-2 rounded-card bg-white p-5">
          <span className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('dir.reportsSubmitted')}</span>
          <span className="text-3xl font-extrabold leading-none">{g.bilansSubmitted}<span className="text-lg text-muted"> / {g.expectedDays}</span></span>
          <Bar value={g.reportingRate} tone="warn" />
        </div>
        <Stat label={t('dir.late')} value={g.late} tone={g.late ? 'bad' : undefined} sub={t('dir.missingReports', { n: Math.max(0, g.expectedDays - g.bilansSubmitted) })} />
      </section>

      <Card aria-label={t('dir.compare')}>
        <SectionTitle>{t('dir.compare')}</SectionTitle>
        <p className="-mt-2 mb-3 text-sm font-semibold text-muted">{t('dir.compareHint', { label: prevLabel })}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase text-muted">
                <th scope="col" className="py-2.5 pr-2" />
                <th scope="col" className="px-2 py-2.5">{t('dir.current')}</th>
                <th scope="col" className="px-2 py-2.5">{t('dir.previous')}</th>
                <th scope="col" className="py-2.5 pl-2">{t('dir.change')}</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => {
                const d = delta(r.cur, r.prev);
                const good = d == null || d === 0 ? null : (d > 0) === r.goodWhenUp;
                return (
                  <tr key={r.label} className="border-t border-[#ECECE7]">
                    <th scope="row" className="py-3 pr-2 text-left font-extrabold">{r.label}</th>
                    <td className="px-2 py-3 font-bold">{r.cur == null ? '—' : `${r.cur}${r.unit}`}</td>
                    <td className="px-2 py-3 font-semibold text-muted">{r.prev == null ? '—' : `${r.prev}${r.unit}`}</td>
                    <td className={`py-3 pl-2 font-extrabold ${good == null ? 'text-muted' : good ? 'text-ok-text' : 'text-bad-text'}`}>{fmtDelta(d)}{d == null ? '' : r.unit === ' %' ? ' pts' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card aria-label={t('dir.individual')}>
        <SectionTitle>{t('dir.individual')}</SectionTitle>
        <p className="-mt-2 mb-3 text-sm font-semibold text-muted">{t('dir.individualHint')}</p>
        {team.members.length === 0 ? <Empty>{t('dir.noMembers')}</Empty> : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {team.members.map(({ profile: p, m }) => {
              const tone = rateTone(m.rate);
              return (
                <Link key={p.id} href={`/direction/collaborateurs/${p.id}?p=${period}`} className="flex min-h-[60px] items-center gap-2.5 rounded-2xl bg-paper p-3 hover:bg-line">
                  <Avatar url={p.avatar_url} color={p.avatar_color} text={initials(p)} size={38} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-extrabold">{fullName(p)}</span>
                    <span className="truncate text-xs font-semibold text-muted">{p.job_title ?? '—'}</span>
                  </span>
                  <span className={`text-sm font-extrabold ${tone === 'bad' ? 'text-bad-text' : tone === 'warn' ? 'text-warn-text' : ''}`}>{m.rate == null ? '—' : `${m.rate} %`}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[2_1_520px]" aria-label={t('dir.byDept')}>
          <SectionTitle right={<Link href="/direction/equipe" className="py-2 text-sm font-extrabold underline">{t('dir.seeTeam')}</Link>}>{t('dir.byDept')}</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase text-muted">
                  <th scope="col" className="py-2.5 pr-2">{t('dir.colDept')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('dir.colActive')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.rate')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.onTime')}</th>
                  <th scope="col" className="py-2.5 pl-2">{t('report.difficulties')}</th>
                </tr>
              </thead>
              <tbody>
                {team.departments.map((d) => (
                  <tr key={d.name} className="border-t border-[#ECECE7]">
                    <th scope="row" className="py-3.5 pr-2 text-left font-extrabold">{d.name}</th>
                    <td className="px-2 py-3.5 font-semibold">{d.count}</td>
                    <td className="px-2 py-3.5">
                      <span className="flex items-center gap-2.5"><Bar className="w-28" value={d.m.rate} tone={rateTone(d.m.rate) === 'ok' ? 'ink' : 'warn'} /><b>{d.m.rate == null ? '—' : `${d.m.rate} %`}</b></span>
                    </td>
                    <td className={`px-2 py-3.5 font-bold ${d.m.onTimeRate != null && d.m.onTimeRate < 80 ? 'text-warn-text' : 'text-ok-text'}`}>{d.m.onTimeRate == null ? '—' : `${d.m.onTimeRate} %`}</td>
                    <td className="py-3.5 pl-2 font-semibold">{d.difficulties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="min-w-0 flex-[1_1_320px]">
          <SectionTitle>{t('dir.trend')}</SectionTitle>
          <RateChart data={trend} label={t('report.rate')} />
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[1_1_320px]" aria-label={t('dir.missingToday')}>
          <SectionTitle right={<Badge tone="warn">{missing.length}</Badge>}>{t('dir.missingToday')}</SectionTitle>
          {missing.length === 0 ? <Empty>{t('dir.allReports')}</Empty> : (
            <ul className="flex flex-col">
              {missing.map((p) => {
                const pl = todayPlans.get(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 border-t border-[#ECECE7] py-2.5 first:border-t-0">
                    <Avatar url={p.avatar_url} color={p.avatar_color} text={initials(p)} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/direction/collaborateurs/${p.id}`} className="font-extrabold underline">{fullName(p)}</Link>
                      <span className={`text-sm font-semibold ${pl && pl.status !== 'draft' ? 'text-muted' : 'text-bad-text'}`}>
                        {p.job_title ? `${p.job_title} · ` : ''}{pl && pl.status !== 'draft' ? t('dir.planOk') : t('dir.noPlan')}
                      </span>
                    </span>
                    <form action={remind}>
                      <input type="hidden" name="user_id" value={p.id} />
                      <button type="submit" className="h-11 rounded-xl border-2 border-ink px-3.5 text-sm font-extrabold">{t('dir.remind')}</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="min-w-0 flex-[1_1_320px]">
          <SectionTitle>{t('dir.recurring')}</SectionTitle>
          <Difficulties plans={team.plans} t={t} />
        </Card>
      </div>
      <p className="text-sm font-semibold text-muted">{t('common.dataNote')}</p>
    </>
  );
}
