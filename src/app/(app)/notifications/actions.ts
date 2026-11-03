'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function markRead(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();
  const id = String(formData.get('id') ?? '');
  const q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null);
  await (id ? q.eq('id', id) : q);
  revalidatePath('/', 'layout');
}
