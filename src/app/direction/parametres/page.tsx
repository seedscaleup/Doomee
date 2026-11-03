import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { fetchVisibleProfiles, fullName } from '@/lib/queries';
import { Badge, Card, SectionTitle, inputCls } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { addCategory, deleteDepartment, saveDepartment, saveSettings, toggleCategory } from './actions';
import type { TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAdmin();
  const { t } = await getT();
  const supabase = createClient();
  const [{ data: departments }, { data: categories }, { data: settings }, people] = await Promise.all([
    supabase.from('departments').select('id, name, manager_id').order('name'),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
    fetchVisibleProfiles(supabase, { activeOnly: true })
  ]);
  const managers = people.filter((p) => p.role !== 'collaborateur');

  return (
    <>
      <div>
        <p className="text-sm font-bold text-muted">{t('settings.kicker')}</p>
        <h1 className="text-3xl font-extrabold">{t('settings.title')}</h1>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card>
          <SectionTitle>{t('settings.departments')}</SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-muted">{t('settings.deptHint')}</p>
          <ul className="flex flex-col gap-2">
            {(departments ?? []).map((d) => (
              <li key={d.id} className="rounded-2xl bg-paper p-3">
                <form action={saveDepartment} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <label className="sr-only" htmlFor={`dn-${d.id}`}>{t('settings.deptName')}</label>
                  <input id={`dn-${d.id}`} name="name" defaultValue={d.name} className="h-10 min-w-0 flex-1 rounded-xl border-2 border-line bg-white px-3 text-sm font-bold" />
                  <label className="sr-only" htmlFor={`dm-${d.id}`}>{t('settings.deptManager')}</label>
                  <select id={`dm-${d.id}`} name="manager_id" defaultValue={d.manager_id ?? ''} className="h-10 rounded-xl border-2 border-line bg-white px-2 text-sm font-bold">
                    <option value="">{t('settings.noManager')}</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
                  </select>
                  <SubmitButton className="h-10 rounded-xl bg-ink px-3 text-sm font-extrabold text-white">{t('common.save')}</SubmitButton>
                </form>
                <form action={deleteDepartment} className="mt-1">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="text-xs font-bold text-bad-text underline">{t('common.delete')}</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveDepartment} className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="newdept">{t('settings.newDept')}</label>
            <input id="newdept" name="name" required placeholder={t('settings.newDept')} className={inputCls} />
            <SubmitButton>{t('planning.add')}</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>{t('settings.categories')}</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
              <li key={c.id}>
                <form action={toggleCategory} className="inline">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(!c.active)} />
                  <button type="submit" title={c.active ? t('settings.disable') : t('settings.enable')}
                    className={`min-h-10 rounded-full px-3.5 text-sm font-bold ${c.active ? 'bg-paper' : 'bg-white text-muted line-through'}`}>
                    {c.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('settings.catHint')}</p>
          <form action={addCategory} className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="newcat">{t('settings.newCat')}</label>
            <input id="newcat" name="name" required placeholder={t('settings.newCat')} className={inputCls} />
            <SubmitButton>{t('planning.add')}</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>{t('settings.general')}</SectionTitle>
          <form action={saveSettings} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-bold">{t('settings.morning')}<input type="time" name="morning_reminder" defaultValue={String(settings?.morning_reminder ?? '08:00').slice(0, 5)} className={inputCls} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-bold">{t('settings.evening')}<input type="time" name="evening_reminder" defaultValue={String(settings?.evening_reminder ?? '17:30').slice(0, 5)} className={inputCls} /></label>
            </div>
            <p className="text-xs text-muted">{t('settings.cronHint')}</p>
            <p className="text-xs text-muted">{t('settings.partialNote')}</p>
            <p className="text-sm"><b>{t('settings.timezone')} :</b> {settings?.timezone ?? 'Africa/Douala'}</p>
            <SubmitButton>{t('common.save')}</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>{t('settings.roles')}</SectionTitle>
          <ul className="flex flex-col">
            {(['admin', 'direction', 'manager', 'collaborateur'] as const).map((r) => (
              <li key={r} className="flex flex-col gap-0.5 border-t border-[#ECECE7] py-2.5 first:border-t-0">
                <span className="flex items-center gap-2 font-extrabold">{t(`role.${r}` as TKey)} <Badge>{people.filter((p) => p.role === r).length}</Badge></span>
                <span className="text-sm text-muted">{t(`role.${r}.desc` as TKey)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
