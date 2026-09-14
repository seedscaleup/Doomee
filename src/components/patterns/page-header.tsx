import { cn } from '@/lib/utils'

/**
 * The top of every screen: what you are looking at, and the one thing you can
 * do about it. The action slot holds a single primary button — the yellow one —
 * because "one dominant yellow element per screen" only works if there is one
 * place it can live.
 *
 * The heading level is a property of the DOCUMENT, not of the component: on a
 * real screen this is the h1, but the same header inside a panel or the design
 * gallery is not, and two h1s on one page is a structural error.
 */
export function PageHeader({
  title,
  description,
  action,
  as: Heading = 'h1',
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Heading className="text-title sm:text-display">{title}</Heading>
        {description ? <p className="max-w-prose text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
