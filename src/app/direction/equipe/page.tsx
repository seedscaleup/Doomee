import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { loadTeam } from '@/lib/team';
import { fullName, initials } from '@/lib/queries';
import { formatShort, normalizePeriod, periodRange, todayISO } from '@/lib/dates';
import { Avatar, Card, Empty, Tabs } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ searchParams }: { searchParams: { p?: string; dept?: string; job?: string; sort?: string } }) {
  await requireStaff();
  const { t, lang } = await getT();
  const supabase = createClient();
  const period = normalizePeriod(searchParams.p);
  const { from, to } = periodRange(period, todayISO());
  const team = await loadTeam(supabase, from, to);
  const dept = searchParams.dept ?? 'all';
  const job = searchParams.job ?? 'all';
  const sort = ['rate', 'onTime', 'late', 'name'].includes(searchParams.sort ?? '') ? searchParams.sort! : 'rate';

  const rows = team.members
    .filter((x) => dept === 'all' || x.profile.department?.name === dept)
    .filter((x) => job === 'all' || (x.profile.job_title ?? '') === job)
    .sort((a, b) => {
      if (sort === 'name') return fullName(a.profile).localeCompare(fullName(b.profile));
      if (sort === 'late') return b.m.late - a.m.late;
      const k = sort === 'onTime' ? 'onTimeRate' : 'rate';
      return (b.m[k] ?? -1) - (a.m[k] ?? -1);
    });
  const deptNames = team.departments.map((d) => d.name);
  const jobTitles = Array.from(new Set(team.members.map((x) => x.profile.job_title).filter((j): j is string => !!j))).sort((a, b) => a.localeCompare(b));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ p: period, dept, job, sort, ...patch });
    return `/direction/equipe?${p.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">{from === to ? formatShort(from, lang) : t('common.fromTo', { from: formatShort(from, lang), to: formatShort(to, lang) })}</p>
          <h1 className="text-3xl font-extrabold">{t('team.title')}</h1>
        </div>
        <Tabs items={(['day', 'week', 'month'] as const).map((k) => ({ href: qs({ p: k }), label: t(`period.${k}`), active: period === k }))} />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/direction/equipe">
        <input type="hidden" name="p" value={period} />
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">{t('team.dept')}
          <select name="dept" defaultValue={dept} className="h-11 rounded-2xl bg-white px-3 text-sm font-bold text-ink">
            <option value="all">{t('team.all')}</option>
            {deptNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">{t('team.job')}
          <select name="job" defaultValue={job} className="h-11 rounded-2xl bg-white px-3 text-sm font-bold text-ink">
            <option value="all">{t('team.all')}</option>
            {jobTitles.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">{t('team.sort')}
          <select name="sort" defaultValue={sort} className="h-11 rounded-2xl bg-white px-3 text-sm font-bold text-ink">
            <option value="rate">{t('report.rate')}</option>
            <option value="onTime">{t('report.onTime')}</option>
            <option value="late">{t('team.lateCol')}</option>
            <option value="name">{t('team.name')}</option>
          </select>
        </label>
        <button type="submit" className="h-11 rounded-2xl bg-ink px-4 text-sm font-extrabold text-white">{t('team.apply')}</button>
      </form>

      <Card>
        {rows.length === 0 ? <Empty>{t('dir.noMembers')}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase text-muted">
                  <th scope="col" className="py-2.5 pr-2">{t('team.member')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('team.dept')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.rate')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.onTime')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.reports')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('team.lateCol')}</th>
                  <th scope="col" className="px-2 py-2.5">{t('report.budget')}</th>
                  <th scope="col" className="py-2.5 text-right">{t('team.report')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ profile: p, m }) => (
                  <tr key={p.id} className="border-t border-[#ECECE7]">
                    <th scope="row" className="py-2.5 pr-2 text-left">
                      <span className="flex items-center gap-2.5">
                        <Avatar url={p.avatar_url} color={p.avatar_color} text={initials(p)} size={34} />
                        <span className="flex flex-col"><span className="font-extrabold">{fullName(p)}</span><span className="text-xs font-semibold text-muted">{p.job_title ?? '—'}</span></span>
                      </span>
                    </th>
                    <td className="px-2 py-2.5 font-semibold">{p.department?.name ?? '—'}</td>
                    <td className={`px-2 py-2.5 font-extrabold ${m.rate != null && m.rate < 60 ? 'text-bad-text' : m.rate != null && m.rate < 75 ? 'text-warn-text' : ''}`}>{m.rate == null ? '—' : `${m.rate} %`}</td>
                    <td className="px-2 py-2.5 font-bold">{m.onTimeRate == null ? '—' : `${m.onTimeRate} %`}</td>
                    <td className="px-2 py-2.5 font-semibold">{m.bilansSubmitted} / {m.expectedDays}</td>
                    <td className={`px-2 py-2.5 font-bold ${m.late >= 3 ? 'text-bad-text' : ''}`}>{m.late}</td>
                    <td className="px-2 py-2.5 font-semibold">{m.budgetUsed ? new Intl.NumberFormat('fr-FR').format(m.budgetUsed) : '—'}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/direction/collaborateurs/${p.id}?p=${period}`} className="inline-flex h-10 items-center rounded-xl bg-ink px-3.5 text-sm font-extrabold text-white">{t('team.fullReport')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
