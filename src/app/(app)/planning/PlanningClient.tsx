'use client';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { ActionForm } from './ActionForm';
import { deleteAction, submitPlan, type FormState } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge } from '@/components/ui';
import { IconTrash, IconWallet } from '@/components/Icons';
import { formatMinutes, formatMoney } from '@/lib/dates';
import type { Action, Option } from '@/lib/types';
import type { TKey } from '@/lib/i18n';

export function PlanningClient({ actions, projects, categories }: { actions: Action[]; projects: Option[]; categories: Option[] }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [submitState, submit] = useFormState<FormState>(submitPlan, {});
  const total = actions.reduce((s, a) => s + a.estimated_minutes, 0);
  const budget = actions.reduce((s, a) => s + Number(a.planned_budget || 0), 0);

  return (
    <>
      {actions.map((a) => (
        <article key={a.id} className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4">
          {editing === a.id ? (
            <>
              <ActionForm projects={projects} categories={categories} action={a} onDone={() => setEditing(null)} />
              <button type="button" onClick={() => setEditing(null)} className="h-11 text-sm font-bold underline">{t('common.cancel')}</button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Badge tone={a.priority === 'high' ? 'brand' : 'none'}>{t(`priority.short.${a.priority}` as TKey)}</Badge>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="font-extrabold">{a.title}</span>
                  {a.expected_result && <span className="text-sm text-muted">{t('planning.expected')} : {a.expected_result}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.project && <Badge>{a.project.name}</Badge>}
                {a.category && <Badge>{a.category.name}</Badge>}
                <Badge>{formatMinutes(a.estimated_minutes)}</Badge>
                {a.deadline && <Badge>{t('planning.deadline', { time: a.deadline.slice(0, 5) })}</Badge>}
                {a.planned_budget ? <Badge tone="brand"><IconWallet size={13} className="mr-1" />{formatMoney(a.planned_budget)}</Badge> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(a.id)} className="h-11 flex-1 rounded-xl bg-paper text-sm font-extrabold">{t('common.edit')}</button>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" aria-label={t('planning.delete', { title: a.title })} className="flex h-11 w-11 items-center justify-center rounded-xl bg-bad-soft text-bad-text"><IconTrash size={18} /></button>
                </form>
              </div>
            </>
          )}
        </article>
      ))}

      <section aria-label={t('planning.newAction')} className="rounded-[20px] border-2 border-ink bg-white p-4">
        <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-muted">{t('planning.newAction')}</h2>
        <ActionForm projects={projects} categories={categories} />
      </section>

      <div className="no-print fixed inset-x-0 bottom-[92px] z-30 mx-auto flex max-w-2xl items-center gap-3 rounded-t-[26px] bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col">
          <span className="font-extrabold">{t('planning.count', { n: actions.length })}</span>
          <span className="text-sm font-semibold text-muted">{formatMinutes(total)}{budget ? ` · ${formatMoney(budget)}` : ''}</span>
        </div>
        <form action={submit} className="flex flex-1 flex-col">
          <SubmitButton className="h-14 rounded-2xl bg-ink text-base font-extrabold text-white disabled:opacity-50">{t('planning.submit')}</SubmitButton>
          {submitState.error && <span role="alert" className="mt-1 text-xs font-bold text-bad-text">{t(submitState.error as TKey)}</span>}
        </form>
      </div>
    </>
  );
}
