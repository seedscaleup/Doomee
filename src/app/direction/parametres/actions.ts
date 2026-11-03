'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const done = () => revalidatePath('/direction/parametres');

export async function saveDepartment(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  const manager_id = String(formData.get('manager_id') ?? '') || null;
  if (!name) return;
  if (id) await supabase.from('departments').update({ name, manager_id }).eq('id', id);
  else await supabase.from('departments').insert({ name, manager_id });
  done();
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from('departments').delete().eq('id', String(formData.get('id') ?? ''));
  done();
}

export async function addCategory(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (!name) return;
  const { data } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  await supabase.from('categories').insert({ name, sort_order: (data?.[0]?.sort_order ?? 0) + 1 });
  done();
}

export async function toggleCategory(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from('categories').update({ active: formData.get('active') === 'true' }).eq('id', String(formData.get('id') ?? ''));
  done();
}

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const time = (k: string, d: string) => { const v = String(formData.get(k) ?? ''); return /^\d{2}:\d{2}$/.test(v) ? v : d; };
  await supabase.from('app_settings').update({
    morning_reminder: time('morning_reminder', '08:00'),
    evening_reminder: time('evening_reminder', '17:30')
  }).eq('id', 1);
  done();
}
