import { fr, type Dict } from './fr';
import { en } from './en';
import type { Lang } from '../types';

export type TKey = keyof Dict;
const dicts: Record<Lang, Dict> = { fr, en };

/** Traduit une clé et remplace les variables {nom}. */
export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let s: string = dicts[lang]?.[key] ?? fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export type T = (key: TKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  return (key, vars) => translate(lang, key, vars);
}
