import { cn } from '@/lib/utils'

/**
 * Progress, visible at a glance — UX principle 3, "show progress".
 *
 * The ring fills with yellow because progress is energy; it turns green only
 * when the thing is actually finished, so "done" reads differently from
 * "nearly done" without anyone having to read the number.
 */
export function ProgressRing({
  value,
  label,
  size = 44,
  className,
}: {
  /** 0 to 100. Values outside the range are clamped rather than drawn wrong. */
  value: number
  /** Announced to screen readers; the ring itself is decorative. */
  label: string
  size?: number
  className?: string
}) {
  const percent = Math.min(100, Math.max(0, Math.round(value)))
  const complete = percent >= 100
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className={complete ? 'stroke-success' : 'stroke-doomee-yellow'}
        />
      </svg>
      <span className="absolute text-caption font-semibold tabular-nums">{percent}</span>
    </div>
  )
}
