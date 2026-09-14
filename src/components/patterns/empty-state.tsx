import { cn } from '@/lib/utils'

/**
 * An empty list is a moment, not an error. It says what would be here and
 * offers the way to create the first one — "every action leads somewhere".
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-doomee border border-dashed border-border-strong px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-section">{title}</p>
      {description ? <p className="max-w-sm text-label text-muted">{description}</p> : null}
      {action}
    </div>
  )
}
