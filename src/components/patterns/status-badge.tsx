import { cn } from '@/lib/utils'

/**
 * A state, shown consistently wherever it appears.
 *
 * The component takes an already-translated label and a tone, never a raw
 * status code: statuses are enums whose labels live in the catalogues
 * (ADR-010), so translating here would put business text in a component.
 */
export type Tone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-muted border-border',
  progress: 'bg-info-soft text-info-text border-info/20',
  success: 'bg-success-soft text-success-text border-success/20',
  warning: 'bg-warning-soft text-warning-text border-warning/25',
  danger: 'bg-danger-soft text-danger-text border-danger/20',
}

export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-doomee-full border px-2.5 py-0.5 text-caption font-medium',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}

/**
 * Priority reads as urgency, so it uses a dot rather than a filled pill: four
 * filled pills in a list would shout, and everything shouting is nothing
 * standing out.
 */
export type PriorityLevel = 'low' | 'normal' | 'high' | 'urgent'

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  low: 'bg-subtle',
  normal: 'bg-info',
  high: 'bg-warning',
  urgent: 'bg-danger',
}

export function PriorityChip({ level, label }: { level: PriorityLevel; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted">
      <span aria-hidden="true" className={cn('size-2 rounded-doomee-full', PRIORITY_DOT[level])} />
      {label}
    </span>
  )
}
