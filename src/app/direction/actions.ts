'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth';

export async function remind(formData: FormData) {
  await requireStaff();
  const supabase = createClient();
  const id = String(formData.get('user_id') ?? '');
  if (id) await supabase.rpc('send_reminder', { target: id });
  revalidatePath('/direction');
}

export async function addObservation(formData: FormData) {
  await requireStaff();
  const supabase = createClient();
  const userId = String(formData.get('user_id') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  if (!userId || !body) return;
  // author_id et author_name sont remplis par la base (trigger)
  await supabase.from('manager_observations').insert({ user_id: userId, body });
  revalidatePath(`/direction/collaborateurs/${userId}`);
}
