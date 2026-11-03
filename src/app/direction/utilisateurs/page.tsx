import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchVisibleProfiles, fullName, initials } from '@/lib/queries';
import { Avatar, Card, SectionTitle } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { CreateUserForm } from './CreateUserForm';
import { sendResetLink, updateUser } from './actions';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const sel = 'h-10 rounded-xl border-2 border-line bg-paper px-2 text-sm font-bold';

export default async function UsersPage() {
  await requireAdmin();
  const { t } = await getT();
  const supabase = createClient();
  const [people, { data: departments }] = await Promise.all([
    fetchVisibleProfiles(supabase),
    supabase.from('departments').select('id, name').order('name')
  ]);
  const active = people.filter((p) => p.status === 'active').length;

  return (
    <>
      <div>
        <p className="text-sm font-bold text-muted">{t('users.count', { n: active, total: people.length })}</p>
        <h1 className="text-3xl font-extrabold">{t('users.title')}</h1>
      </div>

      <Card className="border-2 border-ink">
        <SectionTitle>{t('users.new')}</SectionTitle>
        <CreateUserForm departments={departments ?? []} />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase text-muted">
              <th scope="col" className="py-2 pr-2">{t('team.member')}</th>
              <th scope="col" className="px-2 py-2">{t('users.job')}</th>
              <th scope="col" className="px-2 py-2">{t('team.dept')}</th>
              <th scope="col" className="px-2 py-2">{t('profile.role')}</th>
              <th scope="col" className="px-2 py-2">{t('users.account')}</th>
              <th scope="col" className="py-2"><span className="sr-only">{t('common.save')}</span></th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className={`border-t border-[#ECECE7] ${p.status === 'inactive' ? 'opacity-60' : ''}`}>
                  <th scope="row" className="py-2.5 pr-2 text-left">
                    <span className="flex items-center gap-2.5">
                      <Avatar url={p.avatar_url} color={p.avatar_color} text={initials(p)} size={34} />
                      <span className="flex flex-col"><span className="font-extrabold">{fullName(p)}</span><span className="text-xs font-semibold text-muted">{p.email}</span></span>
                    </span>
                  </th>
                  <td colSpan={5} className="py-2.5">
                    <form action={updateUser} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="sr-only" htmlFor={`job-${p.id}`}>{t('users.job')}</label>
                      <input id={`job-${p.id}`} name="job_title" defaultValue={p.job_title ?? ''} className={`${sel} w-44`} />
                      <label className="sr-only" htmlFor={`dep-${p.id}`}>{t('team.dept')}</label>
                      <select id={`dep-${p.id}`} name="department_id" defaultValue={p.department_id ?? ''} className={`${sel} w-44`}>
                        <option value="">—</option>
                        {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`role-${p.id}`}>{t('profile.role')}</label>
                      <select id={`role-${p.id}`} name="role" defaultValue={p.role} className={sel}>
                        {['collaborateur', 'manager', 'direction', 'admin'].map((r) => <option key={r} value={r}>{t(`role.${r}` as TKey)}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`st-${p.id}`}>{t('users.account')}</label>
                      <select id={`st-${p.id}`} name="status" defaultValue={p.status} className={sel}>
                        <option value="active">{t('users.active')}</option>
                        <option value="inactive">{t('users.inactive')}</option>
                      </select>
                      <SubmitButton className="h-10 rounded-xl bg-ink px-3 text-sm font-extrabold text-white">{t('common.save')}</SubmitButton>
                    </form>
                    <form action={sendResetLink} className="mt-1">
                      <input type="hidden" name="email" value={p.email} />
                      <button type="submit" className="text-xs font-bold text-muted underline">{t('users.sendReset')}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
