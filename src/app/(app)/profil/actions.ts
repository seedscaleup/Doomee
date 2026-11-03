'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export type ProfileState = { error?: string; ok?: string };

const COLORS = ['#202124', '#FFD43B', '#22A06B', '#F59E0B', '#2563EB', '#ECECE7'];
const PREFS = ['morning', 'evening', 'late', 'manager', 'weekly'];

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const profile = await requireProfile();
  const supabase = createClient();
  const first = String(formData.get('first_name') ?? '').trim().slice(0, 80);
  const last = String(formData.get('last_name') ?? '').trim().slice(0, 80);
  if (!first) return { error: 'profile.errName' };
  const color = String(formData.get('avatar_color') ?? '');
  const lang = formData.get('language') === 'en' ? 'en' : 'fr';
  const prefs = Object.fromEntries(PREFS.map((k) => [k, formData.get(`pref_${k}`) === 'on']));
  const avatar = String(formData.get('avatar_url') ?? '');
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: first,
      last_name: last,
      phone: String(formData.get('phone') ?? '').trim().slice(0, 40) || null,
      bio: String(formData.get('bio') ?? '').trim().slice(0, 140) || null,
      avatar_color: COLORS.includes(color) ? color : '#202124',
      avatar_url: avatar.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.id}/`) ? avatar : null,
      language: lang,
      notification_prefs: prefs
    })
    .eq('id', profile.id);
  if (error) return { error: 'common.error' };
  cookies().set('lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
  return { ok: 'profile.saved' };
}

export async function changePassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  await requireProfile();
  const pw = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (pw.length < 8) return { error: 'profile.errPwLength' };
  if (pw !== confirm) return { error: 'profile.errPwMatch' };
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: 'common.error' };
  return { ok: 'profile.pwChanged' };
}
