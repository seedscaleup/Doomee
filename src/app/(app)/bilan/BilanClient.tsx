'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addUnplanned, removeAttachment, removeUnplanned, saveBilan, type ResultInput } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { Badge, inputCls, textareaCls, btnSoft } from '@/components/ui';
import { IconClip, IconPlus, IconTrash, IconWallet } from '@/components/Icons';
import { formatMinutes, formatMoney } from '@/lib/dates';
import type { Action, Option, Plan } from '@/lib/types';
import type { TKey } from '@/lib/i18n';

type Entry = ResultInput & { hours: string; minutes: string };

function initEntry(a: Action): Entry {
  const r = a.result;
  const m = r?.actual_minutes ?? 0;
  return {
    action_id: a.id,
    status: r?.status ?? '',
    actual_result: r?.actual_result ?? '',
    quantity: r?.quantity != null ? String(r.quantity) : '',
    actual_minutes: m,
    hours: m ? String(Math.floor(m / 60)) : '',
    minutes: String(m % 60 - ((m % 60) % 15)),
    budget_used: r?.budget_used != null ? String(r.budget_used) : '',
    justification: r?.justification ?? '',
    difficulty: r?.difficulty ?? '',
    completed_on_time: r?.completed_on_time ?? true,
    newAttachments: []
  };
}

export function BilanClient({ plan, userId, projects, categories }: { plan: Plan; userId: string; projects: Option[]; categories: Option[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [entries, setEntries] = useState<Record<string, Entry>>(() => Object.fromEntries(plan.actions.map((a) => [a.id, initEntry(a)])));
  const [difficulties, setDifficulties] = useState(plan.difficulties ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string; action?: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [unplanned, setUnplanned] = useState({ open: false, title: '', project: '', category: '' });

  const merged = useMemo(() => plan.actions.map((a) => ({ a, e: entries[a.id] ?? initEntry(a) })), [plan.actions, entries]);
  const remaining = merged.filter(({ e }) => !e.status).length;

  const set = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => {
      const action = plan.actions.find((x) => x.id === id);
      const cur = prev[id] ?? (action ? initEntry(action) : undefined);
      if (!cur) return prev;
      const next = { ...cur, ...patch };
      next.actual_minutes = (parseInt(next.hours || '0', 10) || 0) * 60 + (parseInt(next.minutes || '0', 10) || 0);
      return { ...prev, [id]: next };
    });

  const save = (submit: boolean) =>
    start(async () => {
      setMsg(null);
      const res = await saveBilan(plan.id, merged.map(({ e }) => e), difficulties, submit);
      if (res.error) setMsg({ tone: 'bad', text: t(res.error as TKey), action: res.errorAction });
      else {
        setMsg({ tone: 'ok', text: submit ? t('checkout.submitted') : t('checkout.saved') });
        setEntries((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, newAttachments: [] }])));
        router.refresh();
      }
    });

  const upload = async (actionId: string, file: File, kind: 'proof' | 'receipt') => {
    if (file.size > 10 * 1024 * 1024) { setMsg({ tone: 'bad', text: t('checkout.fileTooBig') }); return; }
    setUploading(actionId);
    const supabase = createClient();
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${userId}/${actionId}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from('justificatifs').upload(path, file, { contentType: file.type });
    setUploading(null);
    if (error) { setMsg({ tone: 'bad', text: t('checkout.uploadError') }); return; }
    set(actionId, { newAttachments: [...(entries[actionId]?.newAttachments ?? []), { path, name: file.name, type: file.type, kind }] });
  };

  const openFile = async (path: string) => {
    const supabase = createClient();
    const { data } = await supabase.storage.from('justificatifs').createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  const statuses: { v: Entry['status']; key: TKey; on: string }[] = [
    { v: 'done', key: 'status.done', on: 'bg-ok text-white' },
    { v: 'partial', key: 'status.partialShort', on: 'bg-warn text-ink' },
    { v: 'not_done', key: 'status.notDoneShort', on: 'bg-bad text-white' }
  ];

  return (
    <>
      {merged.map(({ a, e }) => {
        const needWhy = e.status === 'partial' || e.status === 'not_done';
        const hasBudget = !!a.planned_budget || !!e.budget_used;
        const diff = a.planned_budget && e.budget_used ? Number(a.planned_budget) - Number(e.budget_used.replace(/[^\d]/g, '')) : null;
        const existing = a.result?.attachments ?? [];
        return (
          <article key={a.id} id={`a-${a.id}`} className={`flex flex-col gap-3 rounded-[20px] bg-white p-4 ${msg?.action === a.id ? 'ring-2 ring-bad' : ''} ${a.is_unplanned ? 'border-2 border-brand' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-extrabold">{a.title}</span>
                <span className="text-xs font-semibold text-muted">
                  {[a.project?.name, a.is_unplanned ? null : t('checkout.plannedTime', { time: formatMinutes(a.estimated_minutes) })].filter(Boolean).join(' · ')}
                </span>
                {a.expected_result && <span className="text-xs text-muted">{t('planning.expected')} : {a.expected_result}</span>}
              </div>
              {a.is_unplanned && (
                <div className="flex items-center gap-1">
                  <Badge tone="brand">{t('common.unplannedUpper')}</Badge>
                  <button type="button" aria-label={t('common.delete')} onClick={() => start(async () => { await removeUnplanned(plan.id, a.id); router.refresh(); })} className="flex h-10 w-10 items-center justify-center rounded-xl text-bad-text"><IconTrash size={16} /></button>
                </div>
              )}
            </div>

            <fieldset>
              <legend className="pb-1.5 text-sm font-bold">{t('checkout.status')}</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {statuses.map((s) => (
                  <label key={s.v} className={`flex h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-extrabold ${e.status === s.v ? s.on : 'bg-paper'}`}>
                    <input type="radio" name={`st-${a.id}`} className="sr-only" checked={e.status === s.v} onChange={() => set(a.id, { status: s.v })} />
                    {t(s.key)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                {t('checkout.result')}
                <input value={e.actual_result} onChange={(ev) => set(a.id, { actual_result: ev.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                {t('checkout.quantity')}
                <input inputMode="decimal" value={e.quantity} onChange={(ev) => set(a.id, { quantity: ev.target.value })} placeholder={t('common.optionalShort')} className={inputCls} />
              </label>
            </div>

            <fieldset>
              <legend className="pb-1.5 text-sm font-bold">{t('checkout.realTime')}</legend>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`rh-${a.id}`}>{t('common.hours')}</label>
                <input id={`rh-${a.id}`} type="number" min={0} max={16} value={e.hours} onChange={(ev) => set(a.id, { hours: ev.target.value })} placeholder="0" className={inputCls} />
                <span className="font-bold">h</span>
                <label className="sr-only" htmlFor={`rm-${a.id}`}>{t('common.minutes')}</label>
                <select id={`rm-${a.id}`} value={e.minutes} onChange={(ev) => set(a.id, { minutes: ev.target.value })} className={inputCls}>
                  {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </fieldset>

            {e.status === 'done' && (
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={e.completed_on_time} onChange={(ev) => set(a.id, { completed_on_time: ev.target.checked })} className="h-5 w-5 accent-ink" />
                {t('checkout.onTime')}
              </label>
            )}

            {needWhy && (
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                <span>{t('checkout.justification')} <span className="text-bad-text">· {t('common.required')}</span></span>
                <textarea rows={3} value={e.justification} onChange={(ev) => set(a.id, { justification: ev.target.value })} className={`${textareaCls} border-warn bg-[#FFFBEB]`} />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-bold">
              {t('checkout.difficulty')} <span className="font-semibold text-muted">{t('common.optional')}</span>
              <input value={e.difficulty} onChange={(ev) => set(a.id, { difficulty: ev.target.value })} className={inputCls} />
            </label>

            {hasBudget ? (
              <div className="flex flex-col gap-2.5 rounded-2xl bg-brand-soft p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold"><IconWallet size={16} />{t('checkout.budget')}</span>
                  {a.planned_budget ? <span className="text-xs font-bold">{t('checkout.budgetPlanned', { v: formatMoney(a.planned_budget) })}</span> : null}
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  {t('checkout.budgetUsed')}
                  <span className="flex h-12 items-center gap-2 rounded-2xl border-2 border-ink bg-white px-4">
                    <input inputMode="numeric" value={e.budget_used} onChange={(ev) => set(a.id, { budget_used: ev.target.value })} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" />
                    <span className="text-xs font-extrabold text-muted">FCFA</span>
                  </span>
                </label>
                {diff != null && !Number.isNaN(diff) && (
                  <span className={`text-xs font-extrabold ${diff >= 0 ? 'text-ok-text' : 'text-bad-text'}`}>
                    {diff >= 0 ? t('checkout.budgetLeft', { v: formatMoney(diff) }) : t('checkout.budgetOver', { v: formatMoney(-diff) })}
                  </span>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => set(a.id, { budget_used: '0' })} className="self-start py-1 text-sm font-bold underline">{t('checkout.addBudget')}</button>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">{t('checkout.files')}</span>
              <div className="flex flex-wrap gap-2">
                {existing.map((f) => (
                  <span key={f.id} className="flex items-center gap-1 rounded-full bg-ok-soft py-1 pl-3 pr-1 text-xs font-bold text-ok-text">
                    <button type="button" onClick={() => openFile(f.file_path)} className="underline">{f.kind === 'receipt' ? t('checkout.receipt') : t('checkout.proof')} · {f.file_name}</button>
                    <button type="button" aria-label={t('common.delete')} onClick={() => start(async () => { await removeAttachment(f.id, f.file_path); router.refresh(); })} className="flex h-7 w-7 items-center justify-center rounded-full"><IconTrash size={13} /></button>
                  </span>
                ))}
                {e.newAttachments.map((f) => (
                  <span key={f.path} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold">{f.kind === 'receipt' ? t('checkout.receipt') : t('checkout.proof')} · {f.name} ({t('checkout.toSave')})</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['proof', 'receipt'] as const).map((kind) => (
                  <label key={kind} className={`${btnSoft} cursor-pointer border-2 border-dashed border-[#C9CACC] bg-white`}>
                    <IconClip size={16} />
                    {uploading === a.id ? t('checkout.uploading') : kind === 'receipt' ? t('checkout.addReceipt') : t('checkout.addProof')}
                    <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(a.id, f, kind); ev.target.value = ''; }} />
                  </label>
                ))}
              </div>
            </div>
          </article>
        );
      })}

      {unplanned.open ? (
        <section className="flex flex-col gap-3 rounded-[20px] border-2 border-ink bg-white p-4" aria-label={t('checkout.unplannedTitle')}>
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted">{t('checkout.unplannedTitle')}</h2>
          <label className="flex flex-col gap-1.5 text-sm font-bold">{t('planning.fTitle')}
            <input value={unplanned.title} onChange={(ev) => setUnplanned({ ...unplanned, title: ev.target.value })} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-sm font-bold">{t('planning.fProject')}
              <select value={unplanned.project} onChange={(ev) => setUnplanned({ ...unplanned, project: ev.target.value })} className={inputCls}>
                <option value="">{t('planning.noProject')}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">{t('planning.fCategory')}
              <select value={unplanned.category} onChange={(ev) => setUnplanned({ ...unplanned, category: ev.target.value })} className={inputCls}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => start(async () => {
              const r = await addUnplanned(plan.id, unplanned.title, unplanned.project, unplanned.category);
              if (r.error) setMsg({ tone: 'bad', text: t(r.error as TKey) });
              else { setUnplanned({ open: false, title: '', project: '', category: '' }); router.refresh(); }
            })} className="h-12 flex-1 rounded-2xl bg-ink font-extrabold text-white disabled:opacity-50">{t('planning.add')}</button>
            <button type="button" onClick={() => setUnplanned({ ...unplanned, open: false })} className={btnSoft}>{t('common.cancel')}</button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setUnplanned({ ...unplanned, open: true })} className="flex h-14 items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-ink font-extrabold">
          <IconPlus size={18} />{t('checkout.addUnplanned')}
        </button>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t('checkout.dayDifficulties')}
        <textarea rows={2} value={difficulties} onChange={(ev) => setDifficulties(ev.target.value)} placeholder={t('common.optionalShort')} className={`${textareaCls} bg-white`} />
      </label>

      {msg && <p role={msg.tone === 'bad' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-sm font-bold ${msg.tone === 'bad' ? 'bg-bad-soft text-bad-text' : 'bg-ok-soft text-ok-text'}`}>{msg.text}</p>}

      <div className="no-print fixed inset-x-0 bottom-[92px] z-30 mx-auto flex max-w-2xl items-center gap-3 rounded-t-[26px] bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col">
          <span className="font-extrabold">{remaining ? t('checkout.remaining', { n: remaining }) : t('checkout.allFilled')}</span>
          <button type="button" disabled={pending} onClick={() => save(false)} className="text-left text-sm font-bold text-muted underline">{t('checkout.saveDraft')}</button>
        </div>
        <button type="button" disabled={pending} onClick={() => save(true)} className="h-14 flex-1 rounded-2xl bg-ink text-base font-extrabold text-white disabled:opacity-50">
          {pending ? t('common.saving') : t('checkout.submit')}
        </button>
      </div>
    </>
  );
}
