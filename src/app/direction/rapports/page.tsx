import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { loadTeam } from '@/lib/team';
import { fullName, initials } from '@/lib/queries';
import { addDays, firstOfMonth, formatDate, formatMinutes, formatMoney, formatShort, mondayOf, todayISO } from '@/lib/dates';
import { Avatar, Bar, Card, Empty, SectionTitle, Stat, Tabs, btnBrand } from '@/components/ui';
import { Difficulties, TimeByProject } from '@/components/report';
import { IconDownload } from '@/components/Icons';

export const dynamic = 'force-dynamic';

type Kind = 'daily' | 'weekly' | 'monthly';

function rangeFor(kind: Kind, ref: string): { from: string; to: string } {
  const today = todayISO();
  if (kind === 'daily') return { from: ref, to: ref };
  if (kind === 'weekly') { const mo = mondayOf(ref); const end = addDays(mo, 4); return { from: mo, to: end > today ? today : end }; }
  const first = firstOfMonth(ref);
  const [y, m] = first.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: first, to: last > today ? today : last };
}

export default async function ReportsPage({ searchParams }: { searchParams: { k?: string; d?: string } }) {
  await requireStaff();
  const { t, lang } = await getT();
  const supabase = createClient();
  const kind: Kind = searchParams.k === 'weekly' || searchParams.k === 'monthly' ? searchParams.k : 'daily';
  const today = todayISO();
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') && searchParams.d! <= today ? searchParams.d! : today;
  const { from, to } = rangeFor(kind, ref);
  const team = await loadTeam(supabase, from, to);
  const g = team.global;
  const title = kind === 'daily' ? formatDate(from, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : kind === 'weekly' ? t('reports.weekOf', { d: formatShort(from, lang) })
    : formatDate(from, lang, { month: 'long', year: 'numeric' });

  const step = kind === 'daily' ? 1 : kind === 'weekly' ? 7 : 31;
  const prevRef = kind === 'monthly' ? addDays(firstOfMonth(ref), -1) : addDays(ref, -step);
  const nextRefRaw = kind === 'monthly' ? addDays(firstOfMonth(ref), 32) : addDays(ref, step);
  const nextRef = nextRefRaw <= today ? nextRefRaw : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">{t('reports.kicker')}</p>
          <h1 className="text-3xl font-extrabold">{t('reports.title')}</h1>
        </div>
        <Tabs items={(['daily', 'weekly', 'monthly'] as const).map((k) => ({ href: `/direction/rapports?k=${k}&d=${ref}`, label: t(`reports.${k}`), active: kind === k }))} />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/direction/rapports?k=${kind}&d=${prevRef}`} aria-label={t('reports.prev')} className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper text-lg font-extrabold">‹</Link>
          <div className="px-2">
            <p className="text-xs font-extrabold uppercase text-muted">{t(`reports.kind.${kind}`)}</p>
            <h2 className="text-xl font-extrabold">{title}</h2>
          </div>
          {nextRef ? <Link href={`/direction/rapports?k=${kind}&d=${nextRef}`} aria-label={t('reports.next')} className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper text-lg font-extrabold">›</Link> : null}
        </div>
        <form action="/direction/rapports" className="flex items-end gap-2">
          <input type="hidden" name="k" value={kind} />
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">{t('reports.pickDate')}
            <input type="date" name="d" defaultValue={ref} max={today} className="h-11 rounded-xl border-2 border-line bg-paper px-3 text-sm font-bold text-ink" />
          </label>
          <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-sm font-extrabold text-white">{t('team.apply')}</button>
        </form>
        <a href={`/api/rapport?scope=team&from=${from}&to=${to}`} className={btnBrand}><IconDownload size={16} />{t('common.exportPdf')}</a>
      </Card>

      <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Stat dark label={t('report.rate')} value={g.rate == null ? '—' : `${g.rate} %`} sub={t('report.doneOf', { done: g.done, total: g.planned })} />
        <Stat label={t('report.partialLabel')} value={g.partial} tone={g.partial ? 'warn' : undefined} />
        <Stat label={t('report.notDoneLabel')} value={g.notDone} tone={g.notDone ? 'bad' : undefined} />
        <Stat label={t('report.reports')} value={`${g.bilansSubmitted} / ${g.expectedDays}`} sub={g.reportingRate == null ? '' : `${g.reportingRate} %`} />
        <Stat label={t('report.time')} value={formatMinutes(g.realMinutes)} sub={t('report.estimated', { v: formatMinutes(g.estMinutes) })} />
        <Stat label={t('report.budget')} value={g.budgetUsed ? formatMoney(g.budgetUsed) : '—'} sub={g.budgetPlanned ? t('reports.budgetOf', { v: formatMoney(g.budgetPlanned) }) : ''} />
      </section>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[2_1_520px]">
          <SectionTitle>{t('reports.byMember')}</SectionTitle>
          {team.members.length === 0 ? <Empty>{t('dir.noMembers')}</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead><tr className="text-left text-xs font-bold uppercase text-muted">
                  <th scope="col" className="py-2 pr-2">{t('team.member')}</th>
                  <th scope="col" className="px-2 py-2">{t('report.rate')}</th>
                  <th scope="col" className="px-2 py-2">{t('home.done')}</th>
                  <th scope="col" className="px-2 py-2">{t('report.partialLabel')}</th>
                  <th scope="col" className="px-2 py-2">{t('report.notDoneLabel')}</th>
                  <th scope="col" className="px-2 py-2">{t('report.reports')}</th>
                  <th scope="col" className="py-2 text-right">{t('team.report')}</th>
                </tr></thead>
                <tbody>
                  {team.members.map(({ profile: p, m }) => (
                    <tr key={p.id} className="border-t border-[#ECECE7]">
                      <th scope="row" className="py-2.5 pr-2 text-left">
                        <span className="flex items-center gap-2"><Avatar url={p.avatar_url} color={p.avatar_color} text={initials(p)} size={30} /><span className="font-extrabold">{fullName(p)}</span></span>
                      </th>
                      <td className="px-2 py-2.5"><span className="flex items-center gap-2"><Bar className="w-20" value={m.rate} /><b>{m.rate == null ? '—' : `${m.rate} %`}</b></span></td>
                      <td className="px-2 py-2.5">{m.done}</td>
                      <td className="px-2 py-2.5">{m.partial}</td>
                      <td className="px-2 py-2.5">{m.notDone}</td>
                      <td className="px-2 py-2.5">{m.bilansSubmitted} / {m.expectedDays}</td>
                      <td className="py-2.5 text-right">
                        <a href={`/api/rapport?user=${p.id}&from=${from}&to=${to}`} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-ink px-2.5 text-xs font-extrabold"><IconDownload size={14} />PDF</a>{' '}
                        <Link href={`/direction/collaborateurs/${p.id}`} className="inline-flex h-9 items-center rounded-lg bg-ink px-2.5 text-xs font-extrabold text-white">{t('reports.open')}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card>
            <SectionTitle>{t('dir.byDept')}</SectionTitle>
            <ul className="flex flex-col gap-3">
              {team.departments.map((d) => (
                <li key={d.name} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm font-bold"><span>{d.name}</span><span>{d.m.rate == null ? '—' : `${d.m.rate} %`}</span></div>
                  <Bar value={d.m.rate} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>{t('report.timeByProject')}</SectionTitle>
            <TimeByProject plans={team.plans} t={t} />
          </Card>
          <Card>
            <SectionTitle>{t('report.difficulties')}</SectionTitle>
            <Difficulties plans={team.plans} t={t} />
          </Card>
        </div>
      </div>
    </>
  );
}
