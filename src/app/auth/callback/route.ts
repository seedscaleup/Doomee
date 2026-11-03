import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Lien reçu par e-mail (réinitialisation du mot de passe) : échange du code contre une session.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';
  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const safeNext = next.startsWith('/') ? next : '/';
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
