'use client';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { signIn, type AuthState } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { inputCls } from '@/components/ui';
import type { TKey } from '@/lib/i18n';

export function LoginForm() {
  const { t } = useI18n();
  const [state, action] = useFormState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-2xl font-extrabold">{t('login.title')}</h2>
      {state.error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t(state.error as TKey)}</p>}
      <label className="flex flex-col gap-2 text-sm font-bold">
        {t('login.email')}
        <input name="email" type="email" autoComplete="email" required className={inputCls} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-bold">
        <span className="flex items-center justify-between">
          {t('login.password')}
          <Link href="/mot-de-passe-oublie" className="py-1 text-sm font-semibold underline">{t('login.forgot')}</Link>
        </span>
        <input name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </label>
      <SubmitButton className="mt-2 inline-flex h-14 items-center justify-center rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-60" pendingLabel={t('login.signingIn')}>
        {t('login.submit')}
      </SubmitButton>
    </form>
  );
}
