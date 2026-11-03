// Toutes les dates « du jour » sont calculées dans le fuseau de l'organisation.
export const TZ = 'Africa/Douala';

export function todayISO(tz = TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function isWeekday(iso: string): boolean {
  const wd = parseISO(iso).getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Jours ouvrés (lundi-vendredi) entre deux dates incluses. */
export function workdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    if (isWeekday(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Dernier jour ouvré du mois : le prochain jour ouvré tombe dans un autre mois. */
export function isLastWorkdayOfMonth(iso: string): boolean {
  let next = addDays(iso, 1);
  while (!isWeekday(next)) next = addDays(next, 1);
  return next.slice(0, 7) !== iso.slice(0, 7);
}

export function mondayOf(iso: string): string {
  const wd = parseISO(iso).getUTCDay();
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function firstOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function lastWorkdays(n: number, end = todayISO()): string[] {
  const out: string[] = [];
  let cur = end;
  while (out.length < n) {
    if (isWeekday(cur)) out.unshift(cur);
    cur = addDays(cur, -1);
  }
  return out;
}

export type PeriodKey = 'day' | 'week' | 'month';

export function periodRange(p: PeriodKey, today = todayISO()): { from: string; to: string } {
  if (p === 'day') return { from: today, to: today };
  if (p === 'week') return { from: mondayOf(today), to: today };
  return { from: firstOfMonth(today), to: today };
}

/** Période précédente de même nature : veille ouvrée, semaine précédente (même nombre de jours), mois précédent (même nombre de jours). */
export function previousRange(p: PeriodKey, from: string, to: string): { from: string; to: string } {
  if (p === 'day') {
    let d = addDays(from, -1);
    while (!isWeekday(d)) d = addDays(d, -1);
    return { from: d, to: d };
  }
  if (p === 'week') return { from: addDays(from, -7), to: addDays(to, -7) };
  const prevLast = addDays(firstOfMonth(from), -1);
  const prevFirst = firstOfMonth(prevLast);
  const day = Number(to.slice(8, 10));
  const cap = Number(prevLast.slice(8, 10));
  return { from: prevFirst, to: prevFirst.slice(0, 8) + String(Math.min(day, cap)).padStart(2, '0') };
}

export function normalizePeriod(v: string | string[] | undefined): PeriodKey {
  return v === 'week' || v === 'month' ? v : 'day';
}

const locales = { fr: 'fr-FR', en: 'en-GB' } as const;

export function formatDate(iso: string, lang: 'fr' | 'en' = 'fr', opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const s = new Intl.DateTimeFormat(locales[lang], { ...opts, timeZone: 'UTC' }).format(parseISO(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatShort(iso: string, lang: 'fr' | 'en' = 'fr'): string {
  return new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseISO(iso));
}

export function formatTime(ts: string | null, lang: 'fr' | 'en' = 'fr', tz = TZ): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat(locales[lang], { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(ts));
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min === 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
}

export function formatMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-FR').format(v).replace(/ | /g, ' ') + ' FCFA';
}

export function hourNow(tz = TZ): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date()));
}
