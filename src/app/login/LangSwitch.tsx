'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setLangCookie } from './actions';
import type { Lang } from '@/lib/types';

export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [, start] = useTransition();
  const pick = (l: Lang) => start(async () => { await setLangCookie(l); router.refresh(); });
  return (
    <div role="group" aria-label="Langue / Language" className="flex rounded-full bg-ink/10 p-1">
      {(['fr', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => pick(l)}
          className={`h-9 min-w-12 rounded-full px-3 text-sm font-bold ${lang === l ? 'bg-ink text-white' : 'text-ink'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
