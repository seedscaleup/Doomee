'use client';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { changePassword, saveProfile, type ProfileState } from './actions';
import { useI18n } from '@/components/I18nProvider';
import { SubmitButton } from '@/components/SubmitButton';
import { Avatar, inputCls, textareaCls, btnSoft } from '@/components/ui';
import { IconCamera } from '@/components/Icons';
import type { Profile } from '@/lib/types';
import type { TKey } from '@/lib/i18n';

const COLORS = [
  { v: '#202124', k: 'color.ink' }, { v: '#FFD43B', k: 'color.yellow' }, { v: '#22A06B', k: 'color.green' },
  { v: '#F59E0B', k: 'color.orange' }, { v: '#2563EB', k: 'color.blue' }, { v: '#ECECE7', k: 'color.grey' }
] as const;
const PREFS = ['morning', 'evening', 'late', 'manager', 'weekly'] as const;

export function ProfileForm({ profile, departmentName }: { profile: Profile; departmentName: string | null }) {
  const { t } = useI18n();
  const [state, action] = useFormState<ProfileState, FormData>(saveProfile, {});
  const [pwState, pwAction] = useFormState<ProfileState, FormData>(changePassword, {});
  const [avatar, setAvatar] = useState(profile.avatar_url ?? '');
  const [color, setColor] = useState(profile.avatar_color || '#202124');
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  const ini = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?';

  const onPhoto = async (file: File) => {
    setUpErr('');
    if (!file.type.startsWith('image/')) return setUpErr(t('profile.errImage'));
    if (file.size > 3 * 1024 * 1024) return setUpErr(t('profile.errImageSize'));
    setUploading(true);
    const supabase = createClient();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) return setUpErr(t('checkout.uploadError'));
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatar(data.publicUrl);
  };

  return (
    <>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="avatar_url" value={avatar} />
        <input type="hidden" name="avatar_color" value={color} />

        <section aria-label={t('profile.photo')} className="flex flex-col items-center gap-4 rounded-card bg-white p-5">
          <div className="relative">
            <span className="block rounded-full" style={{ boxShadow: `0 0 0 4px ${color}` }}>
              <Avatar url={avatar || null} color={color} text={ini} size={112} />
            </span>
            <label className="absolute -bottom-1 -right-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-[3px] border-white bg-ink text-brand" aria-label={t('profile.changePhoto')}>
              <IconCamera size={18} />
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
            </label>
          </div>
          <div className="text-center">
            <p className="text-xl font-extrabold">{`${first} ${last}`.trim() || profile.email}</p>
            <p className="text-sm font-semibold text-muted">{[profile.job_title, departmentName].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl bg-brand px-4 text-sm font-extrabold">
              {uploading ? t('checkout.uploading') : avatar ? t('profile.changePhoto') : t('profile.addPhoto')}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
            </label>
            {avatar && <button type="button" onClick={() => setAvatar('')} className={btnSoft}>{t('profile.removePhoto')}</button>}
          </div>
          {upErr && <p role="alert" className="text-sm font-bold text-bad-text">{upErr}</p>}
          <fieldset className="w-full">
            <legend className="pb-2 text-sm font-bold">{t('profile.avatarColor')}</legend>
            <div className="flex justify-between gap-2">
              {COLORS.map((c) => (
                <label key={c.v} className="cursor-pointer">
                  <input type="radio" name="color_pick" className="peer sr-only" checked={color === c.v} onChange={() => setColor(c.v)} />
                  <span className="sr-only">{t(c.k as TKey)}</span>
                  <span className="block h-11 w-11 rounded-full border-[3px] border-white peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2" style={{ background: c.v }} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-label={t('profile.info')} className="flex flex-col gap-3 rounded-card bg-white p-5">
          <h2 className="font-extrabold">{t('profile.info')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.firstName')}
              <input name="first_name" value={first} onChange={(e) => setFirst(e.target.value)} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.lastName')}
              <input name="last_name" value={last} onChange={(e) => setLast(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.phone')}
            <input name="phone" type="tel" defaultValue={profile.phone ?? ''} placeholder="+237 6XX XX XX XX" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            <span>{t('profile.bio')} <span className="font-semibold text-muted">· {t('profile.charsLeft', { n: 140 - bio.length })}</span></span>
            <textarea name="bio" rows={3} maxLength={140} value={bio} onChange={(e) => setBio(e.target.value)} className={textareaCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-paper p-3"><p className="text-xs font-bold text-muted">{t('login.email')}</p><p className="break-all text-sm font-bold">{profile.email}</p></div>
            <div className="rounded-2xl bg-paper p-3"><p className="text-xs font-bold text-muted">{t('profile.role')}</p><p className="text-sm font-bold">{t(`role.${profile.role}` as TKey)}</p></div>
          </div>
          <p className="text-xs text-muted">{t('profile.adminManaged')}</p>
        </section>

        <section aria-label={t('profile.notifications')} className="flex flex-col rounded-card bg-white p-5">
          <h2 className="mb-2 font-extrabold">{t('profile.notifications')}</h2>
          {PREFS.map((k) => (
            <label key={k} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 border-t border-[#ECECE7] py-2">
              <span className="flex flex-col">
                <span className="text-sm font-extrabold">{t(`pref.${k}` as TKey)}</span>
                <span className="text-xs font-semibold text-muted">{t(`pref.${k}.sub` as TKey)}</span>
              </span>
              <input type="checkbox" name={`pref_${k}`} defaultChecked={profile.notification_prefs?.[k] !== false} className="peer sr-only" role="switch" />
              <span aria-hidden="true" className="flex h-7 w-12 shrink-0 items-center rounded-full bg-[#C9CACC] p-[3px] transition peer-checked:justify-end peer-checked:bg-ok peer-focus-visible:outline peer-focus-visible:outline-2">
                <span className="h-[22px] w-[22px] rounded-full bg-white" />
              </span>
            </label>
          ))}
        </section>

        <fieldset className="flex flex-col gap-2 rounded-card bg-white p-5">
          <legend className="sr-only">{t('profile.language')}</legend>
          <h2 className="font-extrabold">{t('profile.language')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['fr', 'en'] as const).map((l) => (
              <label key={l} className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-paper bg-paper font-extrabold has-[:checked]:border-ink has-[:checked]:bg-brand">
                <input type="radio" name="language" value={l} defaultChecked={profile.language === l} className="sr-only" />
                {l === 'fr' ? 'Français' : 'English'}
              </label>
            ))}
          </div>
        </fieldset>

        {state.error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-text">{t(state.error as TKey)}</p>}
        {state.ok && <p role="status" className="rounded-2xl bg-ok-soft px-4 py-3 text-sm font-bold text-ok-text">{t(state.ok as TKey)}</p>}
        <SubmitButton className="h-14 rounded-2xl bg-ink text-base font-extrabold text-white disabled:opacity-50">{t('profile.save')}</SubmitButton>
      </form>

      <form action={pwAction} className="flex flex-col gap-3 rounded-card bg-white p-5">
        <h2 className="font-extrabold">{t('profile.security')}</h2>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.newPassword')}
          <input name="password" type="password" minLength={8} autoComplete="new-password" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t('profile.confirmPassword')}
          <input name="confirm" type="password" minLength={8} autoComplete="new-password" className={inputCls} />
        </label>
        {pwState.error && <p role="alert" className="text-sm font-bold text-bad-text">{t(pwState.error as TKey)}</p>}
        {pwState.ok && <p role="status" className="text-sm font-bold text-ok-text">{t(pwState.ok as TKey)}</p>}
        <SubmitButton className="h-12 rounded-2xl border-2 border-ink bg-white font-extrabold">{t('profile.changePassword')}</SubmitButton>
      </form>
    </>
  );
}
