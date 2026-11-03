import { NextResponse } from 'next/server';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { getCurrentProfile, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { makeT, type T, type TKey } from '@/lib/i18n';
import { fetchPlans, fullName } from '@/lib/queries';
import { loadTeam } from '@/lib/team';
import { actionState, computeMetrics, type Metrics } from '@/lib/metrics';
import { formatDate, formatMinutes, formatShort, formatTime, todayISO, workdaysBetween } from '@/lib/dates';
import type { Lang, Plan, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const C = { ink: '#202124', brand: '#FFD43B', paper: '#F5F5F2', line: '#E4E4DF', muted: '#5F6368', ok: '#1A7F55', warn: '#92400E', bad: '#A3262B' };
const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 54, fontFamily: 'Helvetica', fontSize: 10, color: C.ink },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logo: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 22, height: 22, borderRadius: 6, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  logoD: { fontFamily: 'Helvetica-Bold', fontSize: 13 },
  logoWord: { fontFamily: 'Helvetica-Bold', fontSize: 13, letterSpacing: 1 },
  kicker: { fontSize: 8, color: C.muted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 20, marginTop: 2 },
  sub: { fontSize: 10, color: C.muted, marginTop: 3 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginBottom: 6 },
  kpi: { width: '32%', backgroundColor: C.paper, borderRadius: 8, padding: 9, marginRight: '1.3%', marginBottom: 6 },
  kpiDark: { backgroundColor: C.ink, color: '#FFFFFF' },
  kpiLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase' },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  kpiSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, marginTop: 14, marginBottom: 6 },
  day: { marginBottom: 10 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.paper, padding: 6, borderRadius: 6 },
  dayTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.muted, textTransform: 'uppercase' },
  td: { fontSize: 8.5, paddingRight: 4 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.muted },
  note: { fontSize: 8.5, color: C.muted, marginTop: 4 }
});

const pct = (v: number | null) => (v == null ? '—' : `${v} %`);
const money = (v: number) => (v ? `${new Intl.NumberFormat('fr-FR').format(v).replace(/ | /g, ' ')} FCFA` : '—');

function Header({ t, kicker, title, sub }: { t: T; kicker: string; title: string; sub: string }) {
  return (
    <View>
      <View style={s.head}>
        <View style={s.logo}>
          <View style={s.logoBox}><Text style={s.logoD}>D</Text></View>
          <Text style={s.logoWord}>DOOMEE</Text>
        </View>
        <Text style={{ fontSize: 8, color: C.muted }}>{t('pdf.generated', { d: formatShort(todayISO()) })}</Text>
      </View>
      <Text style={s.kicker}>{kicker}</Text>
      <Text style={s.h1}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
    </View>
  );
}

function Kpis({ m, t }: { m: Metrics; t: T }) {
  const items: [string, string, string, boolean?][] = [
    [t('report.rate'), pct(m.rate), t('report.doneOf', { done: m.done, total: m.planned }), true],
    [t('report.otherStatuses'), `${m.partial} / ${m.notDone}`, t('pdf.partialNotDone')],
    [t('report.onTime'), pct(m.onTimeRate), t('report.late', { n: m.late })],
    [t('report.time'), formatMinutes(m.realMinutes), t('report.estimated', { v: formatMinutes(m.estMinutes) })],
    [t('report.reports'), `${m.bilansSubmitted} / ${m.expectedDays}`, t('report.unplanned', { n: m.unplanned })],
    [t('report.budget'), money(m.budgetUsed), m.budgetPlanned ? t('pdf.budgetPlanned', { v: money(m.budgetPlanned) }) : t('report.noBudget')]
  ];
  return (
    <View style={s.kpis}>
      {items.map(([label, value, sub, dark]) => (
        <View key={label} style={dark ? [s.kpi, s.kpiDark] : s.kpi}>
          <Text style={dark ? [s.kpiLabel, { color: C.brand }] : s.kpiLabel}>{label}</Text>
          <Text style={s.kpiValue}>{value}</Text>
          <Text style={dark ? [s.kpiSub, { color: '#C9CACC' }] : s.kpiSub}>{sub}</Text>
        </View>
      ))}
    </View>
  );
}

const cols = [22, 12, 15, 15, 10, 10, 16];
function DayBlock({ date, plan, t, lang }: { date: string; plan?: Plan; t: T; lang: Lang }) {
  const m = plan ? computeMetrics([plan], 1) : null;
  const status = !plan || plan.status === 'draft' ? t('report.noPlanning')
    : plan.status === 'submitted' ? t('report.planOnly', { time: formatTime(plan.submitted_at, lang) })
    : t('report.dayMeta', { p: formatTime(plan.submitted_at, lang), b: formatTime(plan.closed_at, lang), time: formatMinutes(m!.realMinutes) });
  return (
    <View style={s.day} wrap={false}>
      <View style={s.dayHead}>
        <Text style={s.dayTitle}>{formatDate(date, lang)}</Text>
        <Text style={{ fontSize: 8.5, color: C.muted }}>{status}{m && plan?.status === 'closed' ? `  ·  ${t('report.doneOf', { done: m.done, total: m.planned })}` : ''}</Text>
      </View>
      {plan && plan.status !== 'draft' && (
        <View>
          <View style={s.row}>
            {[t('report.colAction'), t('report.colProject'), t('report.colExpected'), t('report.colResult'), t('report.colStatus'), t('pdf.colTime'), t('report.colWhy')].map((h, i) => (
              <Text key={h} style={[s.th, { width: `${cols[i]}%` }]}>{h}</Text>
            ))}
          </View>
          {plan.actions.map((a) => {
            const st = actionState(plan, a);
            const r = a.result;
            const budget = a.planned_budget || r?.budget_used ? `\n${t('report.budget')} : ${money(Number(r?.budget_used ?? 0))}` : '';
            return (
              <View key={a.id} style={s.row}>
                <Text style={[s.td, { width: `${cols[0]}%`, fontFamily: 'Helvetica-Bold' }]}>{a.title}{a.is_unplanned ? ` (${t('common.unplanned')})` : ''}</Text>
                <Text style={[s.td, { width: `${cols[1]}%` }]}>{a.project?.name ?? '—'}</Text>
                <Text style={[s.td, { width: `${cols[2]}%` }]}>{a.expected_result ?? '—'}</Text>
                <Text style={[s.td, { width: `${cols[3]}%` }]}>{r?.actual_result ?? '—'}{r?.quantity != null ? ` (${r.quantity})` : ''}{budget}</Text>
                <Text style={[s.td, { width: `${cols[4]}%`, color: st === 'done' ? C.ok : st === 'partial' ? C.warn : st === 'not_done' ? C.bad : C.muted, fontFamily: 'Helvetica-Bold' }]}>{t(`status.${st}` as TKey)}</Text>
                <Text style={[s.td, { width: `${cols[5]}%` }]}>{a.is_unplanned ? '—' : formatMinutes(a.estimated_minutes)} / {r ? formatMinutes(r.actual_minutes ?? 0) : '—'}</Text>
                <Text style={[s.td, { width: `${cols[6]}%` }]}>{r?.justification || r?.difficulty || '—'}</Text>
              </View>
            );
          })}
          {plan.difficulties ? <Text style={s.note}>{t('report.dayDifficulty')} : {plan.difficulties}</Text> : null}
        </View>
      )}
    </View>
  );
}

function Footer({ t, who }: { t: T; who: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t('pdf.footer', { who })}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export async function GET(request: Request) {
  const viewer = await getCurrentProfile();
  if (!viewer || viewer.status !== 'active') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lang = viewer.language ?? 'fr';
  const t = makeT(lang);
  const url = new URL(request.url);
  const today = todayISO();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : today;
  if (from > to) return NextResponse.json({ error: 'bad range' }, { status: 400 });
  const period = from === to ? formatDate(from, lang) : t('common.fromTo', { from: formatShort(from, lang), to: formatShort(to, lang) });
  const supabase = createClient();
  let doc: React.ReactElement;
  let filename: string;

  if (url.searchParams.get('scope') === 'team') {
    if (!isStaff(viewer)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const team = await loadTeam(supabase, from, to);
    filename = `doomee-rapport-equipe-${from}-${to}.pdf`;
    doc = (
      <Document title={`DOOMEE — ${t('pdf.teamReport')}`}>
        <Page size="A4" style={s.page}>
          <Header t={t} kicker={t('pdf.teamReport')} title={period} sub={t('pdf.members', { n: team.profiles.length })} />
          <Kpis m={team.global} t={t} />
          <Text style={s.h2}>{t('dir.byDept')}</Text>
          {team.departments.map((d) => (
            <View key={d.name} style={s.row}>
              <Text style={[s.td, { width: '40%', fontFamily: 'Helvetica-Bold' }]}>{d.name}</Text>
              <Text style={[s.td, { width: '20%' }]}>{t('pdf.people', { n: d.count })}</Text>
              <Text style={[s.td, { width: '20%' }]}>{t('report.rate')} : {pct(d.m.rate)}</Text>
              <Text style={[s.td, { width: '20%' }]}>{t('report.onTime')} : {pct(d.m.onTimeRate)}</Text>
            </View>
          ))}
          <Text style={s.h2}>{t('reports.byMember')}</Text>
          <View style={s.row}>
            {[t('team.member'), t('report.rate'), t('home.done'), t('report.partialLabel'), t('report.notDoneLabel'), t('report.reports'), t('report.time'), t('report.budget')].map((h, i) => (
              <Text key={h} style={[s.th, { width: i === 0 ? '24%' : '10.8%' }]}>{h}</Text>
            ))}
          </View>
          {team.members.map(({ profile: p, m }) => (
            <View key={p.id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: '24%', fontFamily: 'Helvetica-Bold' }]}>{fullName(p)}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{pct(m.rate)}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{m.done}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{m.partial}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{m.notDone}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{m.bilansSubmitted} / {m.expectedDays}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{formatMinutes(m.realMinutes)}</Text>
              <Text style={[s.td, { width: '10.8%' }]}>{money(m.budgetUsed)}</Text>
            </View>
          ))}
          <Text style={s.note}>{t('common.dataNote')}</Text>
          <Footer t={t} who={fullName(viewer)} />
        </Page>
      </Document>
    );
  } else {
    const userId = url.searchParams.get('user') || viewer.id;
    const { data: person } = await supabase.from('profiles').select('*, department:departments!profiles_department_id_fkey ( name )').eq('id', userId).maybeSingle();
    if (!person) return NextResponse.json({ error: 'forbidden' }, { status: 403 }); // hors périmètre (RLS)
    const p = person as Profile & { department: { name: string } | { name: string }[] | null };
    const deptName = Array.isArray(p.department) ? p.department[0]?.name : p.department?.name;
    const plans = await fetchPlans(supabase, { userIds: [userId], from, to });
    const days = workdaysBetween(from, to).sort((a, b) => b.localeCompare(a));
    const extra = plans.map((x) => x.plan_date).filter((d) => !days.includes(d));
    const allDays = [...days, ...extra].sort((a, b) => b.localeCompare(a));
    const m = computeMetrics(plans, days.length);
    const byDate = new Map(plans.map((x) => [x.plan_date, x]));
    filename = `doomee-rapport-${fullName(p).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-${to}.pdf`;
    doc = (
      <Document title={`DOOMEE — ${fullName(p)}`}>
        <Page size="A4" style={s.page}>
          <Header t={t} kicker={t('member.kicker')} title={fullName(p)} sub={`${[p.job_title, deptName].filter(Boolean).join(' · ')}${p.job_title || deptName ? '  ·  ' : ''}${period}`} />
          <Kpis m={m} t={t} />
          <Text style={s.h2}>{t('member.dayByDay')}</Text>
          {allDays.map((d) => <DayBlock key={d} date={d} plan={byDate.get(d)} t={t} lang={lang} />)}
          <Text style={s.note}>{t('common.dataNote')}</Text>
          <Footer t={t} who={fullName(viewer)} />
        </Page>
      </Document>
    );
  }

  const buffer = await renderToBuffer(doc);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
