import { cn } from '@/lib/utils'

/**
 * The activity feed: who did what, when.
 *
 * Entries arrive already rendered and already localised — the caller knows how
 * to turn a verb plus parameters into a sentence in the reader's language
 * (notifications and activity store `type` + `params`, never text).
 */
export type TimelineEntry = {
  id: string
  /** Already-localised sentence. */
  content: React.ReactNode
  /** Already-formatted timestamp, in the reader's zone. */
  timestamp: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}

const DOT_TONE = {
  neutral: 'bg-border-strong',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const

export function Timeline({
  entries,
  className,
}: {
  entries: readonly TimelineEntry[]
  className?: string
}) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} className="flex gap-3">
          <span className="flex w-3 shrink-0 flex-col items-center pt-1.5" aria-hidden="true">
            <span
              className={cn(
                'size-2 shrink-0 rounded-doomee-full',
                DOT_TONE[entry.tone ?? 'neutral'],
              )}
            />
            {index < entries.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 pb-4">
            <span className="text-label">{entry.content}</span>
            <time className="text-caption text-subtle">{entry.timestamp}</time>
          </span>
        </li>
      ))}
    </ol>
  )
}
