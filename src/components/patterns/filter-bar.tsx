'use client'

import { Select, TextInput } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * Search and filters, in one row that wraps instead of scrolling sideways.
 *
 * Filters are declared, not hand-built per screen, so every list filters the
 * same way and nothing overflows at 375px.
 */
export type FilterOption = { value: string; label: string }

export type FilterDescriptor = {
  key: string
  label: string
  /** The first option is the "all" case and is always selectable. */
  options: readonly FilterOption[]
  value: string
}

export function FilterBar({
  searchLabel,
  searchValue,
  onSearchChange,
  filters = [],
  onFilterChange,
  className,
}: {
  searchLabel: string
  searchValue: string
  onSearchChange: (value: string) => void
  filters?: readonly FilterDescriptor[]
  onFilterChange?: (key: string, value: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end', className)}>
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label className="sr-only" htmlFor="filter-search">
          {searchLabel}
        </label>
        <TextInput
          id="filter-search"
          type="search"
          placeholder={searchLabel}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.key} className="sm:w-44">
          <label className="sr-only" htmlFor={`filter-${filter.key}`}>
            {filter.label}
          </label>
          <Select
            id={`filter-${filter.key}`}
            value={filter.value}
            onChange={(event) => onFilterChange?.(filter.key, event.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  )
}
