// Blocs de rapport partagés entre « Ma performance » et le rapport individuel côté direction.
import { Badge, Bar, Stat, type Tone } from './ui';
import { IconChevron } from './Icons';
import { formatDate, formatMinutes, formatMoney, formatTime } from '@/lib/dates';
import { actionState, computeMetrics, rateTone, type Metrics } from '@/lib/metrics';
import type { T, TKey } from '@/lib/i18n';
import type { Lang, Plan } from '@/lib/types';

const pctText = (v: number | null) => (v == null ? '—' : `${v} %`);
const toneOf = (v: number | null) => {
  const r = rateTone(v);
  return r === 'none' ? undefined : r;
};

export function KpiGrid({ m, t }: { m: Metrics; t: T }) {
  const gap = m.realMinutes - m.estMinutes;
  return (
    <section aria-label={t('report.kpis')} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      <Stat dark label={t('report.rate')} value={pctText(m.rate)} sub={t('report.doneOf', { done: m.done, total: m.planned })} />
      <div className="flex flex-col gap-1 rounded-card bg-white p-5">
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('report.otherStatuses')}</span>
        <span className="font-extrabold text-warn-text">{t('report.partial', { n: m.partial })}</span>
        <span className="font-extrabold text-bad-text">{t('report.notDone', { n: m.notDone })}</span>
        <span className="text-sm font-bold text-muted">{t('report.pending', { n: m.pending })}</span>
      </div>
      <Stat label={t('report.onTime')} value={pctText(m.onTimeRate)} tone={toneOf(m.onTimeRate)} sub={t('report.late', { n: m.late })} />
      <Stat label={t('report.time')} value={formatMinutes(m.realMinutes)}
        sub={<>{t('report.estimated', { v: formatMinutes(m.estMinutes) })}{m.estMinutes ? <b className={gap > 0 ? ' text-warn-text' : ' text-ok-text'}> · {gap >= 0 ? '+' : '−'}{formatMinutes(Math.abs(gap))}</b> : null}</>} />
      <Stat label={t('report.reports')} value={<>{m.bilansSubmitted}<span className="text-lg text-muted"> / {m.expectedDays}</span></>} sub={t('report.unplanned', { n: m.unplanned })} />
      <Stat label={t('report.budget')} value={m.budgetUsed ? formatMoney(m.budgetUsed) : '—'}
        sub={m.budgetPlanned ? t('report.budgetPlanned', { v: formatMoney(m.budgetPlanned), n: m.receipts }) : t('report.noBudget')} />
    </section>
  );
}

const stTone: Record<string, Tone> = { done: 'ok', partial: 'warn', not_done: 'bad', pending: 'none', draft: 'none' };

export function DayList({ plans, expectedDays, t, lang, openFirst = true }: { plans: Plan[]; expectedDays: string[]; t: T; lang: Lang; openFirst?: boolean }) {
  const byDate = new Map(plans.map((p) => [p.plan_date, p]));
  const days = [...expectedDays].sort((a, b) => b.localeCompare(a));
  return (
    <div className="flex flex-col gap-2.5">
      {days.map((d, i) => {
        const plan = byDate.get(d);
        const m = plan ? computeMetrics([plan], 1) : null;
        let meta: string, metaCls = 'text-muted', tag: string, tagTone: Tone = 'none';
        if (!plan || plan.status === 'draft') { meta = t('report.noPlanning'); metaCls = 'text-bad-text'; tag = t('report.absent'); tagTone = 'bad'; }
        else if (plan.status === 'submitted') { meta = t('report.planOnly', { time: formatTime(plan.submitted_at, lang) }); metaCls = 'text-warn-text'; tag = t('report.waitingCheckout', { n: m!.planned }); tagTone = 'warn'; }
        else {
          meta = t('report.dayMeta', { p: formatTime(plan.submitted_at, lang), b: formatTime(plan.closed_at, lang), time: formatMinutes(m!.realMinutes) });
          tag = t('report.doneOf', { done: m!.done, total: m!.planned });
          tagTone = rateTone(m!.rate) === 'ok' ? 'ok' : rateTone(m!.rate) === 'bad' ? 'bad' : 'warn';
        }
        return (
          <details key={d} open={openFirst && i === 0} className="overflow-hidden rounded-[20px] bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-4">
              <IconChevron size={18} className="chev shrink-0 transition-transform" />
              <span className="flex min-w-[180px] flex-1 flex-col">
                <span className="font-extrabold">{formatDate(d, lang)}</span>
                <span className={`text-sm font-semibold ${metaCls}`}>{meta}</span>
              </span>
              <Badge tone={tagTone}>{tag}</Badge>
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {!plan || plan.status === 'draft' ? (
                <p className="rounded-2xl bg-bad-soft p-3 text-sm font-bold text-bad-text">{t('report.noPlanningLong')}</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#ECECE7]">
                  <table className="w-full min-w-[920px] border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-paper text-left text-[11px] font-extrabold uppercase text-muted">
                        <th scope="col" className="px-3 py-2.5">{t('report.colAction')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colProject')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colExpected')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colResult')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colStatus')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colTime')}</th>
                        <th scope="col" className="px-2 py-2.5">{t('report.colBudget')}</th>
                        <th scope="col" className="px-3 py-2.5">{t('report.colWhy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.actions.map((a) => {
                        const st = actionState(plan, a);
                        const r = a.result;
                        return (
                          <tr key={a.id} className="border-t border-[#ECECE7] align-top">
                            <th scope="row" className="px-3 py-3 text-left">
                              <span className="flex flex-col gap-1">
                                <span className="font-extrabold">{a.title}</span>
                                <span className="text-xs font-semibold text-muted">{a.category?.name ?? ''}</span>
                                {a.is_unplanned && <Badge tone="brand" className="self-start text-[10px]">{t('common.unplannedUpper')}</Badge>}
                              </span>
                            </th>
                            <td className="px-2 py-3 font-semibold">{a.project?.name ?? '—'}</td>
                            <td className="px-2 py-3 text-[#3C4043]">{a.expected_result ?? '—'}</td>
                            <td className="px-2 py-3 font-bold">{r?.actual_result ?? '—'}{r?.quantity != null ? ` (${r.quantity})` : ''}</td>
                            <td className="px-2 py-3">
                              <Badge tone={stTone[st]}>{t(`status.${st}` as TKey)}{st === 'done' && r && !r.completed_on_time ? ` · ${t('report.lateShort')}` : ''}</Badge>
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 font-bold">{a.is_unplanned ? '—' : formatMinutes(a.estimated_minutes)} → {r ? formatMinutes(r.actual_minutes ?? 0) : '—'}</td>
                            <td className="whitespace-nowrap px-2 py-3 font-semibold">{a.planned_budget || r?.budget_used ? `${a.planned_budget ? formatMoney(a.planned_budget) : '—'} → ${r?.budget_used != null ? formatMoney(r.budget_used) : '—'}` : '—'}
                              {r?.attachments?.some((x) => x.kind === 'receipt') ? <span className="block text-xs text-ok-text">{t('report.receiptJoined')}</span> : null}
                            </td>
                            <td className="px-3 py-3 leading-snug text-[#3C4043]">{r?.justification || r?.difficulty || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {plan?.difficulties && (
                <p className="rounded-2xl bg-[#FFFBEB] p-3 text-sm"><b>{t('report.dayDifficulty')} :</b> {plan.difficulties}</p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function TimeByProject({ plans, t }: { plans: Plan[]; t: T }) {
  const map = new Map<string, number>();
  for (const p of plans) for (const a of p.actions) if (a.result?.actual_minutes) map.set(a.project?.name ?? t('report.noProject'), (map.get(a.project?.name ?? t('report.noProject')) ?? 0) + a.result.actual_minutes);
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  if (!rows.length) return <p className="text-sm text-muted">{t('report.noTime')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([name, min]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm font-bold"><span>{name}</span><span>{formatMinutes(min)}</span></div>
          <Bar value={(min / max) * 100} />
        </div>
      ))}
    </div>
  );
}

export function Difficulties({ plans, t }: { plans: Plan[]; t: T }) {
  const map = new Map<string, number>();
  for (const p of plans) {
    for (const a of p.actions) {
      const txt = a.result?.justification || a.result?.difficulty;
      if (txt) map.set(txt.trim(), (map.get(txt.trim()) ?? 0) + 1);
    }
    if (p.difficulties) map.set(p.difficulties.trim(), (map.get(p.difficulties.trim()) ?? 0) + 1);
  }
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!rows.length) return <p className="text-sm text-muted">{t('report.noDifficulty')}</p>;
  return (
    <ul className="flex flex-col">
      {rows.map(([txt, n]) => (
        <li key={txt} className="flex justify-between gap-3 border-t border-[#ECECE7] py-2 text-sm first:border-t-0">
          <span className="leading-snug">{txt}</span><span className="whitespace-nowrap font-extrabold text-muted">{t('report.times', { n })}</span>
        </li>
      ))}
    </ul>
  );
}
