'use client';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { requestReset, type AuthState } from '../login/actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { Logo } from '@/components/Logo';
import { inputCls } from '@/components/ui';
import type { TKey } from '@/lib/i18n';

export default function ForgotPage() {
  const { t } = useI18n();
  const [state, action] = useFormState<AuthState, FormData>(requestReset, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand p-5">
      <form action={action} className="flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-white p-7">
        <Logo size={36} />
        <h1 className="mt-2 text-2xl font-extrabold">{t('reset.title')}</h1>
        <p className="text-sm text-muted">{t('reset.intro')}</p>
        {state.ok && <p role="status" className="rounded-2xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok-text">{t(state.ok as TKey)}</p>}
        {state.error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t(state.error as TKey)}</p>}
        <label className="flex flex-col gap-2 text-sm font-bold">
          {t('login.email')}
          <input name="email" type="email" required className={inputCls} />
        </label>
        <SubmitButton>{t('reset.submit')}</SubmitButton>
        <Link href="/login" className="py-2 text-center text-sm font-bold underline">{t('reset.back')}</Link>
      </form>
    </main>
  );
}
