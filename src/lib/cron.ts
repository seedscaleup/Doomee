import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminClient } from './supabase/admin';
import { isLastWorkdayOfMonth, isWeekday, todayISO, TZ } from './dates';

type Row = { user_id: string; type: string; title: string; message: string; link: string };

/** Heure locale « HH:MM » dans le fuseau de l'organisation. */
function nowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date());
}

/**
 * Rappels automatiques (appelés par Vercel Cron, voir vercel.json).
 * - matin : rappel de planification aux personnes qui n'ont pas soumis leur planning
 * - soir  : rappel du bilan, alerte au manager pour les plannings manquants,
 *           et notification « rapport hebdomadaire / mensuel disponible » (vendredi / dernier jour ouvré du mois)
 *
 * Deux modes :
 * - `?fixed=1` (vercel.json, offre gratuite : un appel par jour) : envoi immédiat.
 * - sans paramètre (planificateur appelant toutes les 15 min) : n'envoie qu'à partir de l'heure réglée dans
 *   Paramètres, et une seule fois par jour grâce au contrôle anti-doublon.
 */
export async function runReminders(request: Request, moment: 'matin' | 'soir') {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const today = todayISO();
  if (!isWeekday(today)) return NextResponse.json({ skipped: 'weekend' });
  const db = createAdminClient();

  const fixed = new URL(request.url).searchParams.get('fixed') === '1';
  if (!fixed) {
    const { data: s } = await db.from('app_settings').select('morning_reminder, evening_reminder').eq('id', 1).maybeSingle();
    const due = String((moment === 'matin' ? s?.morning_reminder : s?.evening_reminder) ?? (moment === 'matin' ? '08:00' : '17:30')).slice(0, 5);
    if (nowHHMM() < due) return NextResponse.json({ skipped: 'not_due', due });
  }

  const { data: people } = await db.from('profiles').select('id, role, notification_prefs, department_id').eq('status', 'active');
  const { data: plans } = await db.from('daily_plans').select('user_id, status').eq('plan_date', today);
  const byUser = new Map((plans ?? []).map((p) => [p.user_id, p.status]));
  const rows: Row[] = [];

  for (const p of people ?? []) {
    const prefs = (p.notification_prefs ?? {}) as Record<string, boolean>;
    const st = byUser.get(p.id);
    if (moment === 'matin' && prefs.morning !== false && (!st || st === 'draft')) {
      rows.push({ user_id: p.id, type: 'reminder', title: 'Rappel : planning du matin', message: 'Renseignez les actions prévues aujourd’hui.', link: '/planning' });
    }
    if (moment === 'soir' && prefs.evening !== false && st === 'submitted') {
      rows.push({ user_id: p.id, type: 'reminder', title: 'Rappel : bilan du soir', message: 'Complétez le bilan de vos actions avant de partir.', link: '/bilan' });
    }
  }

  if (moment === 'soir') {
    // Alerte aux managers : collaborateurs sans planning aujourd'hui
    const { data: depts } = await db.from('departments').select('id, manager_id');
    for (const d of depts ?? []) {
      if (!d.manager_id) continue;
      const missing = (people ?? []).filter((p) => p.department_id === d.id && p.id !== d.manager_id && !byUser.get(p.id));
      if (missing.length) {
        rows.push({ user_id: d.manager_id, type: 'late', title: 'Plannings manquants', message: `${missing.length} collaborateur(s) n’ont pas soumis de planning aujourd’hui.`, link: '/direction' });
      }
    }

    // Rapports hebdomadaire (vendredi) et mensuel (dernier jour ouvré) : calculés à la demande à partir des données.
    const isStaff = (r: string) => r === 'admin' || r === 'direction' || r === 'manager';
    const weekly = new Date(`${today}T12:00:00Z`).getUTCDay() === 5;
    const monthly = isLastWorkdayOfMonth(today);
    for (const p of people ?? []) {
      const prefs = (p.notification_prefs ?? {}) as Record<string, boolean>;
      if (prefs.weekly === false) continue;
      if (weekly) {
        rows.push(isStaff(p.role)
          ? { user_id: p.id, type: 'report', title: 'Rapport hebdomadaire disponible', message: 'Le rapport de la semaine est prêt à être consulté et exporté en PDF.', link: '/direction/rapports?k=weekly' }
          : { user_id: p.id, type: 'report', title: 'Votre rapport hebdomadaire est prêt', message: 'Retrouvez votre synthèse de la semaine dans Ma performance.', link: '/performance' });
      }
      if (monthly && isStaff(p.role)) {
        rows.push({ user_id: p.id, type: 'report', title: 'Rapport mensuel disponible', message: 'Le rapport du mois est prêt à être consulté et exporté en PDF.', link: '/direction/rapports?k=monthly' });
      }
    }
  }

  // Anti-doublon : ne jamais renvoyer la même notification au même utilisateur dans les 16 dernières heures.
  const since = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
  const { data: recent } = await db.from('notifications').select('user_id, title').gte('created_at', since).in('type', ['reminder', 'late', 'report']);
  const seen = new Set((recent ?? []).map((n) => `${n.user_id}|${n.title}`));
  const fresh = rows.filter((r) => !seen.has(`${r.user_id}|${r.title}`));

  if (fresh.length) {
    const { error } = await db.from('notifications').insert(fresh);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sent: fresh.length, skippedDuplicates: rows.length - fresh.length });
}
