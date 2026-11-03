'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type UserState = { error?: string; ok?: string; password?: string };

const ROLES = ['admin', 'direction', 'manager', 'collaborateur'];

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const n of arr) s += chars[n % chars.length];
  return s;
}

export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  await requireAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const first = String(formData.get('first_name') ?? '').trim().slice(0, 80);
  const last = String(formData.get('last_name') ?? '').trim().slice(0, 80);
  const role = String(formData.get('role') ?? 'collaborateur');
  const dept = String(formData.get('department_id') ?? '') || null;
  const job = String(formData.get('job_title') ?? '').trim().slice(0, 120) || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !first) return { error: 'users.errFields' };
  if (!ROLES.includes(role)) return { error: 'users.errFields' };

  const admin = createAdminClient();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { first_name: first, last_name: last }
  });
  if (error || !data.user) return { error: error?.message?.includes('already') ? 'users.errExists' : 'common.error' };
  // Le profil est créé par le trigger ; on fixe ensuite rôle, département et fonction.
  const { error: upErr } = await admin.from('profiles').update({ role, department_id: dept, job_title: job, first_name: first, last_name: last }).eq('id', data.user.id);
  if (upErr) return { error: 'common.error' };
  revalidatePath('/direction/utilisateurs');
  return { ok: email, password };
}

export async function updateUser(formData: FormData) {
  await requireAdmin();
  const supabase = createClient(); // RLS : seul un admin peut modifier ces champs
  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '');
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';
  if (!id || !ROLES.includes(role)) return;
  await supabase.from('profiles').update({
    role,
    status,
    department_id: String(formData.get('department_id') ?? '') || null,
    job_title: String(formData.get('job_title') ?? '').trim().slice(0, 120) || null
  }).eq('id', id);
  revalidatePath('/direction/utilisateurs');
}

export async function sendResetLink(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get('email') ?? '');
  if (!email) return;
  const supabase = createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || '';
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/profil?reset=1` });
}
