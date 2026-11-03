import type { Action, Plan } from './types';

/**
 * Indicateurs calculés UNIQUEMENT à partir des données enregistrées.
 * Un indicateur sans données renvoie null : l'interface affiche alors « — ».
 */
export interface Metrics {
  planned: number;          // actions planifiées (hors imprévues)
  done: number;
  partial: number;
  notDone: number;
  pending: number;          // actions dont le bilan n'est pas encore soumis
  unplanned: number;
  estMinutes: number;
  realMinutes: number;
  late: number;
  onTimeRate: number | null;
  rate: number | null;      // terminées / planifiées
  plansSubmitted: number;
  bilansSubmitted: number;
  expectedDays: number;
  reportingRate: number | null;
  budgetPlanned: number;
  budgetUsed: number;
  budgetActions: number;
  receipts: number;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function computeMetrics(plans: Plan[], expectedDays?: number): Metrics {
  const m: Metrics = {
    planned: 0, done: 0, partial: 0, notDone: 0, pending: 0, unplanned: 0,
    estMinutes: 0, realMinutes: 0, late: 0, onTimeRate: null, rate: null,
    plansSubmitted: 0, bilansSubmitted: 0, expectedDays: expectedDays ?? plans.length, reportingRate: null,
    budgetPlanned: 0, budgetUsed: 0, budgetActions: 0, receipts: 0
  };
  let doneOnTime = 0;
  for (const plan of plans) {
    if (plan.status !== 'draft') m.plansSubmitted++;
    if (plan.status === 'closed') m.bilansSubmitted++;
    for (const a of plan.actions) {
      const r = a.result;
      if (r?.actual_minutes) m.realMinutes += r.actual_minutes;
      if (a.planned_budget) { m.budgetPlanned += Number(a.planned_budget); m.budgetActions++; }
      if (r?.budget_used) m.budgetUsed += Number(r.budget_used);
      if (r?.attachments) m.receipts += r.attachments.filter((x) => x.kind === 'receipt').length;
      if (a.is_unplanned) { m.unplanned++; continue; }
      if (plan.status === 'draft') continue;
      m.planned++;
      m.estMinutes += a.estimated_minutes || 0;
      if (plan.status !== 'closed' || !r) { m.pending++; continue; }
      if (r.status === 'done') { m.done++; if (r.completed_on_time) doneOnTime++; else m.late++; }
      if (r.status === 'partial') { m.partial++; if (!r.completed_on_time) m.late++; }
      if (r.status === 'not_done') { m.notDone++; m.late++; }
    }
  }
  m.rate = pct(m.done, m.planned);
  m.onTimeRate = pct(doneOnTime, m.done);
  m.reportingRate = pct(m.bilansSubmitted, m.expectedDays);
  return m;
}

export function actionState(plan: Plan, a: Action): 'done' | 'partial' | 'not_done' | 'pending' | 'draft' {
  if (plan.status === 'draft') return 'draft';
  if (plan.status !== 'closed' || !a.result) return 'pending';
  return a.result.status;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, it) => {
    const k = key(it);
    (acc[k] ||= []).push(it);
    return acc;
  }, {});
}

export function rateTone(rate: number | null): 'ok' | 'warn' | 'bad' | 'none' {
  if (rate == null) return 'none';
  if (rate >= 75) return 'ok';
  if (rate >= 50) return 'warn';
  return 'bad';
}
