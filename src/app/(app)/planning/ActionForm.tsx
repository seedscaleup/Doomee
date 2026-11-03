'use client';
import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { saveAction, type FormState } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { inputCls, textareaCls } from '@/components/ui';
import type { Action, Option } from '@/lib/types';
import type { TKey } from '@/lib/i18n';

export function ActionForm({ projects, categories, action, onDone }: { projects: Option[]; categories: Option[]; action?: Action; onDone?: () => void }) {
  const { t } = useI18n();
  const [state, formAction] = useFormState<FormState, FormData>(saveAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      if (!action) ref.current?.reset();
      onDone?.();
    }
  }, [state.ok, action, onDone]);

  const est = action?.estimated_minutes ?? 0;
  const prio = action?.priority ?? 'medium';
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      {action && <input type="hidden" name="id" value={action.id} />}
      {state.error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t(state.error as TKey)}</p>}
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t('planning.fTitle')}
        <input name="title" required maxLength={200} defaultValue={action?.title} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t('planning.fExpected')}
        <input name="expected_result" required maxLength={500} defaultValue={action?.expected_result ?? ''} placeholder={t('planning.fExpectedPh')} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t('planning.fDescription')} <span className="font-semibold text-muted">{t('common.optional')}</span>
        <textarea name="description" rows={2} defaultValue={action?.description ?? ''} className={textareaCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t('planning.fProject')}
          <select name="project_id" defaultValue={action?.project?.id ?? ''} className={inputCls}>
            <option value="">{t('planning.noProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t('planning.fCategory')}
          <select name="category_id" defaultValue={action?.category?.id ?? ''} className={inputCls}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-sm font-bold">{t('planning.fTime')}</legend>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`h-${action?.id ?? 'new'}`}>{t('common.hours')}</label>
            <input id={`h-${action?.id ?? 'new'}`} name="est_hours" type="number" min={0} max={16} defaultValue={Math.floor(est / 60) || ''} placeholder="0" className={inputCls} />
            <span className="text-sm font-bold">h</span>
            <label className="sr-only" htmlFor={`m-${action?.id ?? 'new'}`}>{t('common.minutes')}</label>
            <select id={`m-${action?.id ?? 'new'}`} name="est_minutes" defaultValue={String(est % 60)} className={inputCls}>
              {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t('planning.fDeadline')}
          <input name="deadline" type="time" defaultValue={action?.deadline?.slice(0, 5) ?? ''} className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        <span>{t('planning.fBudget')} <span className="font-semibold text-muted">· {t('planning.fBudgetHint')}</span></span>
        <span className="flex h-12 items-center gap-2 rounded-2xl border-2 border-line bg-paper px-4 focus-within:border-ink">
          <input name="planned_budget" inputMode="numeric" defaultValue={action?.planned_budget ?? ''} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          <span className="text-sm font-extrabold text-muted">FCFA</span>
        </span>
        <span className="text-xs font-medium text-muted">{t('planning.fBudgetEx')}</span>
      </label>
      <fieldset>
        <legend className="pb-1.5 text-sm font-bold">{t('planning.fPriority')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['high', 'medium', 'low'] as const).map((p) => (
            <label key={p} className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-paper text-sm font-bold has-[:checked]:bg-brand">
              <input type="radio" name="priority" value={p} defaultChecked={prio === p} className="accent-ink" />
              {t(`priority.${p}` as TKey)}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton>{action ? t('common.save') : t('planning.add')}</SubmitButton>
    </form>
  );
}
