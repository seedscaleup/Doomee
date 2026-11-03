'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth';

const STATUSES = ['draft', 'active', 'on_hold', 'done'];

export async function saveProject(formData: FormData) {
  await requireStaff();
  const supabase = createClient();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim().slice(0, 160);
  if (!name) return;
  const date = (k: string) => { const v = String(formData.get(k) ?? ''); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const status = String(formData.get('status') ?? 'active');
  const budget = String(formData.get('budget') ?? '').replace(/[^\d]/g, '');
  const row = {
    name,
    client_name: String(formData.get('client_name') ?? '').trim().slice(0, 160) || null,
    description: String(formData.get('description') ?? '').trim().slice(0, 2000) || null,
    objectives: String(formData.get('objectives') ?? '').trim().slice(0, 2000) || null,
    manager_id: String(formData.get('manager_id') ?? '') || null,
    start_date: date('start_date'),
    end_date: date('end_date'),
    status: STATUSES.includes(status) ? status : 'active',
    budget: budget ? Number(budget) : null
  };
  if (id) await supabase.from('projects').update(row).eq('id', id);
  else await supabase.from('projects').insert(row);
  revalidatePath('/direction/projets');
}
