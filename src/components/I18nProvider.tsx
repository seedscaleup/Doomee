'use client';
import { createContext, useContext, useMemo } from 'react';
import { makeT, type T } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: 'fr', t: makeT('fr') });

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
