import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal, accessible form primitives. LOT 2 builds the full Doomee vocabulary;
 * these exist so LOT 1 screens are usable and keyboard-navigable without
 * inventing a design system a lot early (CLAUDE.md rule 8).
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; describedBy?: string }) => React.ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'min-h-11 w-full rounded-[--radius-doomee] border border-border bg-surface px-3 text-base ' +
  'placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-doomee-black disabled:opacity-60'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL, 'py-2', props.className)} />
}

/**
 * The yellow button is the single "this is where it happens" element per screen
 * (CLAUDE.md §9). Secondary actions are deliberately quiet.
 */
export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-[--radius-doomee] px-4 text-sm font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doomee-black',
        'disabled:opacity-60',
        variant === 'primary'
          ? 'bg-doomee-yellow text-doomee-black'
          : 'border border-border bg-surface text-doomee-black',
        props.className,
      )}
    />
  )
}

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success'
  children: React.ReactNode
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[--radius-doomee] border px-3 py-2 text-sm',
        tone === 'error'
          ? 'border-danger/30 bg-danger/5 text-danger'
          : 'border-success/30 bg-success/5 text-success',
      )}
    >
      {children}
    </p>
  )
}
