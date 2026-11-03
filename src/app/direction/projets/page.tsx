import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchVisibleProfiles, fullName } from '@/lib/queries';
import { formatMinutes, formatMoney, formatShort } from '@/lib/dates';
import { Badge, Bar, Card, Empty, Tabs, inputCls, textareaCls, type Tone } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { saveProject } from './actions';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, Tone> = { active: 'warn', draft: 'none', on_hold: 'bad', done: 'ok' };

export default async function ProjectsPage({ searchParams }: { searchParams: { s?: string; edit?: string } }) {
  await requireStaff();
  const { t, lang } = await getT();
  const supabase = createClient();
  const filter = ['active', 'done', 'on_hold', 'draft'].includes(searchParams.s ?? '') ? searchParams.s! : 'all';
  const [{ data: projects }, people] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    fetchVisibleProfiles(supabase, { activeOnly: true })
  ]);
  const list = (projects ?? []).filter((p) => filter === 'all' || p.status === filter);
  const ids = list.map((p) => p.id);
  // Actions rattachées (visibles selon les droits)
  const { data: actions } = ids.length
    ? await supabase.from('actions').select('project_id, is_unplanned, planned_budget, result:daily_results ( status, actual_minutes, budget_used )').in('project_id', ids)
    : { data: [] as never[] };
  const stats = new Map<string, { total: number; done: number; minutes: number; budgetPlanned: number; budgetUsed: number }>();
  for (const a of actions ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = Array.isArray(a.result) ? a.result[0] : a.result;
    const s = stats.get(a.project_id!) ?? { total: 0, done: 0, minutes: 0, budgetPlanned: 0, budgetUsed: 0 };
    if (!a.is_unplanned) s.total++;
    if (r?.status === 'done' && !a.is_unplanned) s.done++;
    s.minutes += r?.actual_minutes ?? 0;
    s.budgetPlanned += Number(a.planned_budget ?? 0);
    s.budgetUsed += Number(r?.budget_used ?? 0);
    stats.set(a.project_id!, s);
  }
  const editing = (projects ?? []).find((p) => p.id === searchParams.edit);
  const nameOf = (id: string | null) => fullName(people.find((p) => p.id === id));

  const form = (p?: (typeof list)[number]) => (
    <form action={saveProject} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.name')}<input name="name" required defaultValue={p?.name} className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.client')}<input name="client_name" defaultValue={p?.client_name ?? ''} className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.lead')}
        <select name="manager_id" defaultValue={p?.manager_id ?? ''} className={inputCls}>
          <option value="">—</option>
          {people.map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.status')}
        <select name="status" defaultValue={p?.status ?? 'active'} className={inputCls}>
          {['draft', 'active', 'on_hold', 'done'].map((s) => <option key={s} value={s}>{t(`projects.st.${s}` as TKey)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.start')}<input type="date" name="start_date" defaultValue={p?.start_date ?? ''} className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.end')}<input type="date" name="end_date" defaultValue={p?.end_date ?? ''} className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('projects.budget')}<input name="budget" inputMode="numeric" defaultValue={p?.budget ?? ''} placeholder="FCFA" className={inputCls} /></label>
      <label className="col-span-full flex flex-col gap-1.5 text-sm font-bold">{t('projects.description')}<textarea name="description" rows={2} defaultValue={p?.description ?? ''} className={textareaCls} /></label>
      <label className="col-span-full flex flex-col gap-1.5 text-sm font-bold">{t('projects.objectives')}<textarea name="objectives" rows={2} defaultValue={p?.objectives ?? ''} className={textareaCls} /></label>
      <div className="col-span-full flex gap-2">
        <SubmitButton>{p ? t('common.save') : t('projects.create')}</SubmitButton>
        {p && <Link href="/direction/projets" className="inline-flex h-12 items-center px-4 text-sm font-bold underline">{t('common.cancel')}</Link>}
      </div>
    </form>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">{t('projects.kicker')}</p>
          <h1 className="text-3xl font-extrabold">{t('projects.title')}</h1>
        </div>
        <Tabs items={[['all', 'projects.all'], ['active', 'projects.st.active'], ['done', 'projects.st.done']].map(([k, l]) => ({ href: `/direction/projets?s=${k}`, label: t(l as TKey), active: filter === k }))} />
      </div>

      <Card className={editing ? 'border-2 border-ink' : ''}>
        <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-muted">{editing ? t('projects.editTitle', { name: editing.name }) : t('projects.new')}</h2>
        {form(editing)}
      </Card>

      {list.length === 0 ? <Empty>{t('projects.empty')}</Empty> : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {list.map((p) => {
            const s = stats.get(p.id) ?? { total: 0, done: 0, minutes: 0, budgetPlanned: 0, budgetUsed: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : null;
            return (
              <Card as="article" key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-extrabold">{p.name}</h3>
                    <p className="text-sm font-semibold text-muted">{t('projects.clientLine', { c: p.client_name || '—' })}</p>
                  </div>
                  <Badge tone={statusTone[p.status] ?? 'none'}>{t(`projects.st.${p.status}` as TKey)}</Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm font-bold"><span className="text-muted">{t('projects.actionsDone')}</span><span>{s.done} / {s.total}</span></div>
                  <Bar value={pct} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{t('projects.leadShort', { n: nameOf(p.manager_id) })}</Badge>
                  <Badge>{formatMinutes(s.minutes)}</Badge>
                  {p.end_date && <Badge>{t('projects.endShort', { d: formatShort(p.end_date, lang) })}</Badge>}
                  {(s.budgetUsed > 0 || p.budget) && <Badge tone="brand">{formatMoney(s.budgetUsed)}{p.budget ? ` / ${formatMoney(p.budget)}` : ''}</Badge>}
                </div>
                <Link href={`/direction/projets?edit=${p.id}`} className="self-start py-1 text-sm font-extrabold underline">{t('common.edit')}</Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
