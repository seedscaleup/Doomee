import { cn } from '@/lib/utils'

/**
 * A placeholder with the SHAPE of what is coming, not a spinner.
 *
 * A spinner says "wait"; a skeleton says "here is what you are waiting for",
 * and the page does not jump when the data lands. It is hidden from assistive
 * technology — the loading state is announced by the live region instead.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-doomee bg-surface-sunken', className)}
    />
  )
}

export function SkeletonList({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span role="status" className="sr-only">
        {label}
      </span>
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}
