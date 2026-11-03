'use server';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string; ok?: string };

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'login.missing' };
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'login.invalid' };
  redirect('/');
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'login.missing' };
  const supabase = createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || headers().get('origin') || '';
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/profil?reset=1` });
  // Même réponse que l'adresse existe ou non (ne pas révéler les comptes)
  return { ok: 'reset.sent' };
}

export async function setLangCookie(lang: 'fr' | 'en') {
  cookies().set('lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}
