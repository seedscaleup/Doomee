'use client';
import { useFormStatus } from 'react-dom';
import { btnPrimary } from './ui';
import { useI18n } from './I18nProvider';

export function SubmitButton({ children, className, pendingLabel, name, value }: { children: React.ReactNode; className?: string; pendingLabel?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={className ?? btnPrimary}>
      {pending ? pendingLabel ?? t('common.saving') : children}
    </button>
  );
}
