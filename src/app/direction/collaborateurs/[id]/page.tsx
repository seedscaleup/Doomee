import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchPlans, fetchVisibleProfiles, fullName, initials } from '@/lib/queries';
import { computeMetrics, groupBy } from '@/lib/metrics';
import { formatDate, formatMinutes, formatShort, mondayOf, normalizePeriod, periodRange, todayISO, workdaysBetween, addDays } from '@/lib/dates';
import { Avatar, Bar, Card, SectionTitle, Tabs, btnBrand, textareaCls } from '@/components/ui';
import { DayList, Difficulties, KpiGrid, TimeByProject } from '@/components/report';
import { SubmitButton } from '@/components/SubmitButton';
import { IconArrowLeft, IconDownload } from '@/components/Icons';
import { addObservation } from '../../actions';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function MemberReport({ params, searchParams }: { params: { id: string }; searchParams: { p?: string } }) {
  const me = await requireStaff();
  const { t, lang } = await getT();
  const supabase = createClient();
  const period = normalizePeriod(searchParams.p ?? 'week');
  const today = todayISO();
  const range = period === 'month' ? { from: addDays(today, -27), to: today } : periodRange(period, today);
  const { from, to } = range;

  const people = await fetchVisibleProfiles(supabase);
  const idx = people.findIndex((p) => p.id === params.id);
  if (idx < 0) notFound(); // hors de son périmètre (RLS) ou inexistant
  const person = people[idx];
  const prev = people[(idx - 1 + people.length) % people.length];
  const next = people[(idx + 1) % people.length];

  const expected = workdaysBetween(from, to);
  const [plans, { data: observations }, { data: audit }] = await Promise.all([
    fetchPlans(supabase, { userIds: [person.id], from, to }),
    supabase.from('manager_observations').select('id, body, created_at, author_name').eq('user_id', person.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('audit_logs').select('id, action_type, entity_type, created_at, previous_value, new_value').eq('owner_id', person.id).order('created_at', { ascending: false }).limit(15)
  ]);
  const m = computeMetrics(plans, expected.length);

  // Synthèse par semaine (vue 4 semaines)
  const weeks = period === 'month'
    ? Object.entries(groupBy(expected, (d) => mondayOf(d))).sort((a, b) => b[0].localeCompare(a[0])).map(([monday, ds]) => {
        const wp = plans.filter((p) => ds.includes(p.plan_date));
        return { monday, m: computeMetrics(wp, ds.length) };
      })
    : [];

  // Catégories : volume et quantités déclarées (indicateurs métier)
  const cats = new Map<string, { n: number; done: number; qty: number }>();
  for (const p of plans) for (const a of p.actions) {
    const k = a.category?.name ?? t('report.noCategory');
    const c = cats.get(k) ?? { n: 0, done: 0, qty: 0 };
    c.n++; if (a.result?.status === 'done') c.done++; c.qty += Number(a.result?.quantity ?? 0);
    cats.set(k, c);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/direction/equipe" className="flex min-h-11 items-center gap-2 text-sm font-extrabold"><IconArrowLeft size={18} />{t('member.back')}</Link>
        <div className="flex gap-2">
          <Link href={`/direction/collaborateurs/${prev.id}?p=${period}`} className="flex h-11 items-center rounded-xl bg-white px-3.5 text-sm font-bold">‹ {fullName(prev)}</Link>
          <Link href={`/direction/collaborateurs/${next.id}?p=${period}`} className="flex h-11 items-center rounded-xl bg-white px-3.5 text-sm font-bold">{fullName(next)} ›</Link>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar url={person.avatar_url} color={person.avatar_color} text={initials(person)} size={64} />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('member.kicker')}</p>
            <h1 className="text-3xl font-extrabold">{fullName(person)}</h1>
            <p className="text-sm font-semibold text-muted">{[person.job_title, person.department?.name, t(`role.${person.role}` as TKey)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs items={(['day', 'week', 'month'] as const).map((k) => ({ href: `/direction/collaborateurs/${person.id}?p=${k}`, label: t(`member.period.${k}` as TKey), active: period === k }))} />
          <a href={`/api/rapport?user=${person.id}&from=${from}&to=${to}`} className={btnBrand}><IconDownload size={16} />{t('common.exportPdf')}</a>
        </div>
      </Card>
      <p className="text-sm font-bold text-muted">{t('member.periodLabel')} : {from === to ? formatDate(from, lang) : t('common.fromTo', { from: formatShort(from, lang), to: formatShort(to, lang) })} ({t('member.workdays', { n: expected.length })})</p>

      <KpiGrid m={m} t={t} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-3">
          {weeks.length > 0 && (
            <Card>
              <SectionTitle>{t('member.weeks')}</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead><tr className="text-left text-xs font-bold uppercase text-muted">
                    <th scope="col" className="py-2 pr-2">{t('member.week')}</th>
                    <th scope="col" className="px-2 py-2">{t('home.planned')}</th>
                    <th scope="col" className="px-2 py-2">{t('home.done')}</th>
                    <th scope="col" className="px-2 py-2">{t('report.rate')}</th>
                    <th scope="col" className="px-2 py-2">{t('report.time')}</th>
                    <th scope="col" className="py-2 pl-2">{t('report.reports')}</th>
                  </tr></thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.monday} className="border-t border-[#ECECE7]">
                        <th scope="row" className="py-3 pr-2 text-left font-extrabold">{t('member.weekOf', { d: formatShort(w.monday, lang) })}</th>
                        <td className="px-2 py-3">{w.m.planned}</td>
                        <td className="px-2 py-3">{w.m.done}</td>
                        <td className="px-2 py-3"><span className="flex items-center gap-2"><Bar className="w-24" value={w.m.rate} /><b>{w.m.rate == null ? '—' : `${w.m.rate} %`}</b></span></td>
                        <td className="px-2 py-3">{formatMinutes(w.m.realMinutes)}</td>
                        <td className="py-3 pl-2">{w.m.bilansSubmitted} / {w.m.expectedDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <h2 className="text-lg font-extrabold">{t('member.dayByDay')}</h2>
          <DayList plans={plans} expectedDays={expected} t={t} lang={lang} />
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <Card>
            <SectionTitle>{t('member.byCategory')}</SectionTitle>
            {cats.size === 0 ? <p className="text-sm text-muted">{t('report.noTime')}</p> : (
              <ul className="flex flex-col text-sm">
                {[...cats.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, c]) => (
                  <li key={k} className="flex justify-between gap-2 border-t border-[#ECECE7] py-2 first:border-t-0">
                    <span className="font-bold">{k}</span>
                    <span className="text-muted">{t('member.catLine', { done: c.done, n: c.n })}{c.qty ? ` · ${t('member.qty', { q: c.qty })}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <SectionTitle>{t('report.timeByProject')}</SectionTitle>
            <TimeByProject plans={plans} t={t} />
          </Card>
          <Card>
            <SectionTitle>{t('report.difficulties')}</SectionTitle>
            <Difficulties plans={plans} t={t} />
          </Card>
          <Card>
            <SectionTitle>{t('report.observations')}</SectionTitle>
            <div className="flex flex-col gap-2">
              {(observations ?? []).map((o) => (
                <div key={o.id} className="rounded-2xl bg-paper p-3">
                  <p className="text-xs font-extrabold text-muted">{o.author_name ?? t('report.manager')} · {formatShort(o.created_at.slice(0, 10), lang)}</p>
                  <p className="mt-1 text-sm leading-relaxed">{o.body}</p>
                </div>
              ))}
              {person.id !== me.id && (
                <form action={addObservation} className="flex flex-col gap-2">
                  <input type="hidden" name="user_id" value={person.id} />
                  <label className="text-sm font-bold" htmlFor="obs">{t('member.addObs')}</label>
                  <textarea id="obs" name="body" rows={3} required maxLength={2000} placeholder={t('member.obsPh')} className={`${textareaCls} bg-white`} />
                  <SubmitButton>{t('member.saveObs')}</SubmitButton>
                </form>
              )}
            </div>
          </Card>
          <Card>
            <SectionTitle>{t('member.audit')}</SectionTitle>
            {!audit?.length ? <p className="text-sm text-muted">{t('member.noAudit')}</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="leading-snug">
                    <b>{formatShort(a.created_at.slice(0, 10), lang)}</b> · {t(`audit.${a.entity_type}` as TKey)} — {t(`audit.op.${a.action_type}` as TKey)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
