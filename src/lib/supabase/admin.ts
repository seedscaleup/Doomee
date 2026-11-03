import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Client "service role" : contourne la RLS. À utiliser UNIQUEMENT côté serveur,
 * après avoir vérifié les droits de l'utilisateur (création de comptes, rappels planifiés).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
