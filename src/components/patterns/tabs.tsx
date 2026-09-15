'use client'

import { cn } from '@/lib/utils'

/**
 * The tab row of a detail screen.
 *
 * A component at its third occurrence, not its first guess (rule 8): clients,
 * projects and actions all have one, and the third arrival came with a bug the
 * other two were one tab away from.
 *
 * ⚠️ `overflow-x-auto` and `shrink-0` are the point. Five tabs do not fit in
 * 393 CSS pixels, and a row that does not scroll on its own widens the PAGE
 * instead — 83px of sideways scroll on a phone, which moves every tap target
 * on the screen. The row scrolls; the page never does (rule 9).
 */
export type TabDescriptor<Key extends string> = {
  key: Key
  label: string
}

export function Tabs<Key extends string>({
  tabs,
  active,
  onSelect,
  label,
  className,
}: {
  tabs: readonly TabDescriptor<Key>[]
  active: Key
  onSelect: (key: Key) => void
  /** Names the row for screen readers — the entity it belongs to. */
  label: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onSelect(tab.key)}
          className={cn(
            'min-h-touch shrink-0 whitespace-nowrap border-b-2 px-3 text-label',
            active === tab.key
              ? 'border-doomee-black font-semibold'
              : 'border-transparent text-muted',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
