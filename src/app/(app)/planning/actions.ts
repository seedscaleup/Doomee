'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { todayISO } from '@/lib/dates';

export type FormState = { error?: string; ok?: number };

function int(v: FormDataEntryValue | null): number {
  const n = parseInt(String(v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function money(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : null;
}
function text(v: FormDataEntryValue | null, max = 2000): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

async function getOrCreateTodayPlan() {
  const profile = await requireProfile();
  const supabase = createClient();
  const today = todayISO();
  const { data: existing } = await supabase.from('daily_plans').select('id, status').eq('user_id', profile.id).eq('plan_date', today).maybeSingle();
  if (existing) return { supabase, plan: existing, profile };
  const { data, error } = await supabase.from('daily_plans').insert({ user_id: profile.id, plan_date: today }).select('id, status').single();
  if (error) throw new Error(error.message);
  return { supabase, plan: data, profile };
}

function readAction(formData: FormData) {
  const priority = String(formData.get('priority') ?? 'medium');
  const deadline = String(formData.get('deadline') ?? '').trim();
  return {
    title: text(formData.get('title'), 200),
    description: text(formData.get('description')),
    expected_result: text(formData.get('expected_result'), 500),
    project_id: text(formData.get('project_id')),
    category_id: text(formData.get('category_id')),
    priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
    deadline: /^\d{2}:\d{2}$/.test(deadline) ? deadline : null,
    estimated_minutes: int(formData.get('est_hours')) * 60 + int(formData.get('est_minutes')),
    planned_budget: money(formData.get('planned_budget'))
  };
}

export async function saveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = readAction(formData);
  if (!fields.title) return { error: 'planning.errTitle' };
  if (!fields.expected_result) return { error: 'planning.errExpected' };
  if (fields.estimated_minutes <= 0) return { error: 'planning.errTime' };
  const { supabase, plan } = await getOrCreateTodayPlan();
  if (plan.status !== 'draft') return { error: 'planning.errLocked' };
  const id = text(formData.get('id'));
  const { error } = id
    ? await supabase.from('actions').update(fields).eq('id', id).eq('plan_id', plan.id)
    : await supabase.from('actions').insert({ ...fields, plan_id: plan.id });
  if (error) return { error: 'common.error' };
  revalidatePath('/planning');
  revalidatePath('/accueil');
  return { ok: Date.now() };
}

export async function deleteAction(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const id = String(formData.get('id') ?? '');
  if (id) await supabase.from('actions').delete().eq('id', id);
  revalidatePath('/planning');
  revalidatePath('/accueil');
}

export async function submitPlan(_prev: FormState): Promise<FormState> {
  const { supabase, plan } = await getOrCreateTodayPlan();
  if (plan.status !== 'draft') return { error: 'planning.errLocked' };
  const { count } = await supabase.from('actions').select('id', { count: 'exact', head: true }).eq('plan_id', plan.id);
  if (!count) return { error: 'planning.errEmpty' };
  const { error } = await supabase.from('daily_plans').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', plan.id);
  if (error) return { error: 'common.error' };
  revalidatePath('/planning');
  revalidatePath('/accueil');
  return { ok: Date.now() };
}
