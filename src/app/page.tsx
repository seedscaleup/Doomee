import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';

// Redirection selon le rôle
export default async function Home() {
  const p = await requireProfile();
  if (p.role === 'admin' || p.role === 'direction') redirect('/direction');
  redirect('/accueil');
}
