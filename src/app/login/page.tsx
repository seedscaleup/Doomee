import { getT } from '@/lib/i18n/server';
import { Logo } from '@/components/Logo';
import { LoginForm } from './LoginForm';
import { LangSwitch } from './LangSwitch';

export default async function LoginPage({ searchParams }: { searchParams: { inactive?: string } }) {
  const { t, lang } = await getT();
  return (
    <main className="flex min-h-screen flex-col bg-brand md:items-center md:justify-center md:p-8">
      <div className="flex w-full flex-1 flex-col md:max-w-md md:flex-none md:overflow-hidden md:rounded-[32px] md:shadow-xl">
        <div className="flex justify-end px-5 pt-5">
          <LangSwitch lang={lang} />
        </div>
        <div className="flex flex-col gap-4 px-7 pb-8 pt-8">
          <Logo size={48} inverse />
          <h1 className="mt-3 whitespace-pre-line text-[38px] font-extrabold leading-[1.08] tracking-tight">{t('login.headline')}</h1>
          <p className="text-base font-medium text-[#3B3A2E]">{t('login.tagline')}</p>
        </div>
        <div className="flex-1 rounded-t-[32px] bg-white px-7 py-8 md:rounded-none">
          {searchParams.inactive && <p role="alert" className="mb-4 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t('login.inactive')}</p>}
          <LoginForm />
          <p className="mt-8 text-center text-sm leading-relaxed text-muted">{t('login.help')}</p>
        </div>
      </div>
    </main>
  );
}
