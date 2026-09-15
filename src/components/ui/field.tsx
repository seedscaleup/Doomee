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
      <label htmlFor={id} className="text-label font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/* 16px text on controls: anything smaller makes iOS zoom on focus. */
const CONTROL =
  'min-h-touch w-full rounded-doomee border border-border bg-surface px-3 text-base ' +
  'placeholder:text-subtle disabled:opacity-60 disabled:bg-surface-sunken'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL, 'py-2', props.className)} />
}

/**
 * Real prose gets a real box.
 *
 * Added for the report editor, where a section body is several paragraphs a
 * person actually writes — a single-line input turns that into typing through
 * a letterbox. `rows` defaults to four: tall enough to see a paragraph, short
 * enough that eleven sections still fit on a phone (rule 9).
 */
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={4}
      {...props}
      className={cn(CONTROL, 'resize-y py-2 leading-relaxed', props.className)}
    />
  )
}

/**
 * The yellow button is the single "this is where it happens" element per screen
 * (CLAUDE.md §9). Secondary actions are deliberately quiet, and destructive
 * ones are red — never yellow, because yellow means "go ahead".
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-doomee-yellow text-doomee-black hover:brightness-95',
  secondary: 'border border-border bg-surface text-doomee-black hover:bg-surface-sunken',
  danger: 'bg-danger-text text-surface hover:brightness-110',
  ghost: 'text-doomee-black hover:bg-surface-sunken',
}

export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={cn(
        'inline-flex min-h-touch items-center justify-center rounded-doomee px-4 text-label font-semibold',
        'transition-[filter,background-color] disabled:opacity-60 disabled:hover:brightness-100',
        BUTTON_VARIANT[variant],
        props.className,
      )}
    />
  )
}

const ALERT_TONES = {
  // Brand colours for the fill and the border, their `-text` siblings for the
  // text itself (ADR-032) — the contrast test reads these classes' tokens.
  error: 'border-danger/30 bg-danger-soft text-danger-text',
  success: 'border-success/30 bg-success-soft text-success-text',
  warning: 'border-warning/30 bg-warning-soft text-warning-text',
} as const

export function Alert({
  tone,
  children,
}: {
  tone: keyof typeof ALERT_TONES
  children: React.ReactNode
}) {
  return (
    <p
      // A warning is a status, not an interruption: it is already on screen
      // when the reader arrives, so it does not deserve an assertive role.
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-doomee border px-3 py-2 text-label', ALERT_TONES[tone])}
    >
      {children}
    </p>
  )
}
