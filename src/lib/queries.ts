import type { SupabaseClient } from '@supabase/supabase-js';
import type { Plan, Profile } from './types';

export const PLAN_SELECT = `
  id, user_id, plan_date, status, submitted_at, closed_at, difficulties,
  actions (
    id, plan_id, title, description, expected_result, priority, deadline, estimated_minutes,
    planned_budget, is_unplanned, created_at,
    project:projects ( id, name, client_name ),
    category:categories ( id, name ),
    result:daily_results ( *, attachments ( * ) )
  )
`;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePlan(raw: any): Plan {
  return {
    ...raw,
    actions: (raw.actions ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({ ...a, project: one(a.project), category: one(a.category), result: one(a.result) }))
      .sort((x: { created_at: string }, y: { created_at: string }) => x.created_at.localeCompare(y.created_at))
  };
}

export async function fetchPlans(
  supabase: SupabaseClient,
  opts: { userIds?: string[]; from: string; to: string }
): Promise<Plan[]> {
  let q = supabase.from('daily_plans').select(PLAN_SELECT).gte('plan_date', opts.from).lte('plan_date', opts.to).order('plan_date', { ascending: false });
  if (opts.userIds) {
    if (opts.userIds.length === 0) return [];
    q = q.in('user_id', opts.userIds);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizePlan);
}

export async function fetchPlanForDay(supabase: SupabaseClient, userId: string, date: string): Promise<Plan | null> {
  const { data, error } = await supabase.from('daily_plans').select(PLAN_SELECT).eq('user_id', userId).eq('plan_date', date).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizePlan(data) : null;
}

/** Profils visibles par l'utilisateur connecté (la RLS limite automatiquement le périmètre). */
export async function fetchVisibleProfiles(supabase: SupabaseClient, opts: { activeOnly?: boolean } = {}): Promise<Profile[]> {
  let q = supabase.from('profiles').select('*, department:departments!profiles_department_id_fkey ( id, name, manager_id )').order('first_name');
  if (opts.activeOnly) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({ ...p, department: one(p.department) }));
}

export function fullName(p: Pick<Profile, 'first_name' | 'last_name' | 'email'> | null | undefined): string {
  if (!p) return '—';
  const n = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return n || p.email;
}

export function initials(p: Pick<Profile, 'first_name' | 'last_name' | 'email'>): string {
  const n = fullName(p);
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}
