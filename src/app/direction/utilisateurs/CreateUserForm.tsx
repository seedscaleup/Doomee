'use client';
import { useFormState } from 'react-dom';
import { createUser, type UserState } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { inputCls } from '@/components/ui';
import type { Option } from '@/lib/types';
import type { TKey } from '@/lib/i18n';

export function CreateUserForm({ departments }: { departments: Option[] }) {
  const { t } = useI18n();
  const [state, action] = useFormState<UserState, FormData>(createUser, {});
  return (
    <form action={action} className="grid items-end gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.firstName')}<input name="first_name" required className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.lastName')}<input name="last_name" className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('login.email')}<input name="email" type="email" required className={inputCls} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('users.job')}<input name="job_title" className={inputCls} placeholder={t('users.jobPh')} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('team.dept')}
        <select name="department_id" className={inputCls}>
          <option value="">—</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.role')}
        <select name="role" defaultValue="collaborateur" className={inputCls}>
          {['collaborateur', 'manager', 'direction', 'admin'].map((r) => <option key={r} value={r}>{t(`role.${r}` as TKey)}</option>)}
        </select>
      </label>
      <SubmitButton>{t('users.create')}</SubmitButton>
      {state.error && <p role="alert" className="col-span-full rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t(state.error as TKey)}</p>}
      {state.ok && (
        <div role="status" className="col-span-full rounded-2xl bg-ok-soft px-4 py-3 text-sm text-ok-text">
          <p className="font-extrabold">{t('users.created', { email: state.ok })}</p>
          <p className="mt-1">{t('users.tempPassword')} <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-bold text-ink">{state.password}</code></p>
          <p className="mt-1 text-xs">{t('users.tempHint')}</p>
        </div>
      )}
    </form>
  );
}
