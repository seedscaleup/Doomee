'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export interface ResultInput {
  action_id: string;
  status: 'done' | 'partial' | 'not_done' | '';
  actual_result: string;
  quantity: string;
  actual_minutes: number;
  budget_used: string;
  justification: string;
  difficulty: string;
  completed_on_time: boolean;
  newAttachments: { path: string; name: string; type: string; kind: 'proof' | 'receipt' }[];
}

export type BilanState = { error?: string; errorAction?: string; ok?: number };

async function ownPlan(planId: string) {
  const profile = await requireProfile();
  const supabase = createClient();
  const { data: plan } = await supabase.from('daily_plans').select('id, user_id, status').eq('id', planId).maybeSingle();
  if (!plan || plan.user_id !== profile.id) throw new Error('forbidden');
  return { supabase, plan, profile };
}

const clean = (s: string, max = 2000) => (s ?? '').trim().slice(0, max) || null;
const num = (s: string) => {
  const v = String(s ?? '').replace(/[^\d.,]/g, '').replace(',', '.');
  return v ? Number(v) : null;
};

export async function saveBilan(planId: string, entries: ResultInput[], difficulties: string, submit: boolean): Promise<BilanState> {
  const { supabase, plan, profile } = await ownPlan(planId);
  if (plan.status !== 'submitted') return { error: 'checkout.errState' };

  const { data: actions } = await supabase.from('actions').select('id, is_unplanned').eq('plan_id', planId);
  const ids = new Set((actions ?? []).map((a) => a.id));

  for (const e of entries) {
    if (!ids.has(e.action_id)) continue;
    if (!e.status) {
      if (submit) return { error: 'checkout.errStatus', errorAction: e.action_id };
      continue;
    }
    if (e.status !== 'done' && !clean(e.justification)) return { error: 'checkout.errJustification', errorAction: e.action_id };
    const { data: res, error } = await supabase
      .from('daily_results')
      .upsert(
        {
          action_id: e.action_id,
          status: e.status,
          actual_result: clean(e.actual_result, 1000),
          quantity: num(e.quantity),
          actual_minutes: Math.max(0, Math.round(e.actual_minutes || 0)),
          budget_used: num(e.budget_used),
          justification: e.status === 'done' ? null : clean(e.justification),
          difficulty: clean(e.difficulty),
          completed_on_time: e.status === 'done' ? !!e.completed_on_time : false
        },
        { onConflict: 'action_id' }
      )
      .select('id')
      .single();
    if (error || !res) return { error: 'common.error', errorAction: e.action_id };
    const files = (e.newAttachments ?? []).filter((f) => f.path.startsWith(profile.id + '/'));
    if (files.length) {
      await supabase.from('attachments').insert(files.map((f) => ({ result_id: res.id, file_path: f.path, file_name: f.name.slice(0, 200), file_type: f.type.slice(0, 100), kind: f.kind })));
    }
  }

  if (submit) {
    const missing = (actions ?? []).filter((a) => !entries.find((e) => e.action_id === a.id && e.status));
    if (missing.length) return { error: 'checkout.errStatus', errorAction: missing[0].id };
    const { error } = await supabase.from('daily_plans').update({ status: 'closed', closed_at: new Date().toISOString(), difficulties: clean(difficulties) }).eq('id', planId);
    if (error) return { error: 'common.error' };
  } else {
    await supabase.from('daily_plans').update({ difficulties: clean(difficulties) }).eq('id', planId);
  }
  revalidatePath('/bilan');
  revalidatePath('/accueil');
  revalidatePath('/performance');
  return { ok: Date.now() };
}

export async function addUnplanned(planId: string, title: string, projectId: string, categoryId: string): Promise<BilanState> {
  const { supabase, plan } = await ownPlan(planId);
  if (plan.status !== 'submitted') return { error: 'checkout.errState' };
  const tt = title.trim().slice(0, 200);
  if (!tt) return { error: 'planning.errTitle' };
  const { error } = await supabase.from('actions').insert({
    plan_id: planId, title: tt, is_unplanned: true, estimated_minutes: 0,
    project_id: projectId || null, category_id: categoryId || null
  });
  if (error) return { error: 'common.error' };
  revalidatePath('/bilan');
  return { ok: Date.now() };
}

export async function removeUnplanned(planId: string, actionId: string): Promise<BilanState> {
  const { supabase } = await ownPlan(planId);
  await supabase.from('actions').delete().eq('id', actionId).eq('plan_id', planId).eq('is_unplanned', true);
  revalidatePath('/bilan');
  return { ok: Date.now() };
}

export async function removeAttachment(attachmentId: string, path: string): Promise<BilanState> {
  const profile = await requireProfile();
  const supabase = createClient();
  if (!path.startsWith(profile.id + '/')) return { error: 'common.error' };
  await supabase.from('attachments').delete().eq('id', attachmentId);
  await supabase.storage.from('justificatifs').remove([path]);
  revalidatePath('/bilan');
  return { ok: Date.now() };
}
