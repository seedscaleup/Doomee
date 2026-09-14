import { cn } from '@/lib/utils'

/**
 * Initials rather than generated colours: a palette of random avatar colours
 * fights the one place colour is supposed to mean something here.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        'inline-grid size-8 shrink-0 place-items-center rounded-doomee-full border border-border bg-surface-sunken text-caption font-semibold text-muted',
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  )
}

/**
 * Who is on this. Beyond `max` it counts the rest rather than growing, so a
 * twelve-person project does not push the row off a phone screen.
 */
export function AvatarStack({
  names,
  max = 4,
  className,
}: {
  names: readonly string[]
  max?: number
  className?: string
}) {
  const shown = names.slice(0, max)
  const hidden = names.length - shown.length

  return (
    <span className={cn('flex items-center', className)}>
      {shown.map((name, index) => (
        <Avatar key={name} name={name} className={index > 0 ? '-ml-2' : undefined} />
      ))}
      {hidden > 0 ? (
        <span className="-ml-2 inline-grid size-8 place-items-center rounded-doomee-full border border-border bg-surface text-caption font-semibold text-muted">
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}
