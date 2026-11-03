import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from './supabase/server';
import type { Lang, Profile } from './types';

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*, department:departments!profiles_department_id_fkey ( id, name, manager_id )')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  return { ...data, department: Array.isArray(data.department) ? data.department[0] ?? null : data.department } as Profile;
});

export async function requireProfile(): Promise<Profile> {
  const p = await getCurrentProfile();
  if (!p) redirect('/login');
  if (p.status !== 'active') redirect('/login?inactive=1');
  return p;
}

export function isStaff(p: Profile): boolean {
  return p.role === 'admin' || p.role === 'direction' || p.role === 'manager';
}

export async function requireStaff(): Promise<Profile> {
  const p = await requireProfile();
  if (!isStaff(p)) redirect('/accueil');
  return p;
}

export async function requireAdmin(): Promise<Profile> {
  const p = await requireProfile();
  if (p.role !== 'admin') redirect('/direction');
  return p;
}

export async function getLang(): Promise<Lang> {
  const p = await getCurrentProfile();
  if (p?.language === 'en' || p?.language === 'fr') return p.language;
  const c = cookies().get('lang')?.value;
  return c === 'en' ? 'en' : 'fr';
}
