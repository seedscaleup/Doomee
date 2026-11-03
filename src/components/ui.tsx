import Link from 'next/link';
import type { ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-label'?: string }) {
  return (
    <Tag className={cx('rounded-card bg-white p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-extrabold">{children}</h2>
      {right}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-extrabold uppercase tracking-wide text-muted">{children}</span>;
}

const tones = {
  ok: 'bg-ok-soft text-ok-text',
  warn: 'bg-warn-soft text-warn-text',
  bad: 'bg-bad-soft text-bad-text',
  brand: 'bg-brand text-ink',
  ink: 'bg-ink text-white',
  none: 'bg-paper text-ink'
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'none', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold', tones[tone], className)}>{children}</span>;
}

export function Stat({ label, value, sub, tone, dark }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad'; dark?: boolean }) {
  const valueColor = tone === 'ok' ? 'text-ok-text' : tone === 'warn' ? 'text-warn-text' : tone === 'bad' ? 'text-bad-text' : '';
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-card p-5', dark ? 'bg-ink text-white' : 'bg-white')}>
      <span className={cx('text-xs font-extrabold uppercase tracking-wide', dark ? 'text-brand' : 'text-muted')}>{label}</span>
      <span className={cx('text-3xl font-extrabold leading-none', !dark && valueColor)}>{value}</span>
      {sub && <span className={cx('text-sm font-semibold', dark ? 'text-[#C9CACC]' : 'text-muted')}>{sub}</span>}
    </div>
  );
}

export function Bar({ value, tone = 'ink', className }: { value: number | null; tone?: 'ink' | 'brand' | 'ok' | 'warn' | 'bad'; className?: string }) {
  const color = { ink: 'bg-ink', brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return (
    <div className={cx('h-2.5 overflow-hidden rounded-full bg-paper', className)} role="presentation">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

export function Ring({ value, label, size = 104 }: { value: number | null; label: string; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value ?? '—'} % ${label}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F5F5F2" strokeWidth="14" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFD43B" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="800" fill="#202124">{value == null ? '—' : `${value}%`}</text>
      <text x="50%" y="66%" textAnchor="middle" fontSize="11" fontWeight="600" fill="#5F6368">{label}</text>
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-paper p-5 text-center text-sm font-semibold text-muted">{children}</p>;
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'ok' | 'brand'; children: ReactNode }) {
  const c = { warn: 'bg-warn-soft text-warn-text', bad: 'bg-bad-soft text-bad-text', ok: 'bg-ok-soft text-ok-text', brand: 'bg-brand-soft text-ink' }[tone];
  return <p role="status" className={cx('rounded-2xl px-4 py-3 text-sm font-bold', c)}>{children}</p>;
}

export function Avatar({ url, color, text, size = 44 }: { url?: string | null; color?: string | null; text: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const bg = color || '#202124';
  const light = ['#FFD43B', '#ECECE7', '#F59E0B'].includes(bg.toUpperCase());
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, background: bg, color: light ? '#202124' : bg === '#202124' ? '#FFD43B' : '#FFFFFF', fontSize: size * 0.34 }}>
      {text}
    </span>
  );
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl bg-white p-1" aria-label="Période">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.active ? 'page' : undefined}
          className={cx('flex h-10 items-center rounded-xl px-4 text-sm font-extrabold', it.active ? 'bg-ink text-white' : 'text-muted hover:text-ink')}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export const inputCls = 'h-12 w-full rounded-2xl border-2 border-line bg-paper px-4 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none';
export const textareaCls = 'w-full rounded-2xl border-2 border-line bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none';
export const btnPrimary = 'inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-[15px] font-extrabold text-white hover:bg-black disabled:opacity-50';
export const btnBrand = 'inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[15px] font-extrabold text-ink hover:brightness-95 disabled:opacity-50';
export const btnGhost = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-white px-4 text-sm font-extrabold text-ink hover:bg-paper disabled:opacity-50';
export const btnSoft = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-paper px-4 text-sm font-extrabold text-ink hover:bg-line disabled:opacity-50';
