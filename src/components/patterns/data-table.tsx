'use client'

import { cn } from '@/lib/utils'

/**
 * One list component for every list screen.
 *
 * ONE table, one DOM node per row. An earlier version rendered the rows twice —
 * a card list for phones and a table for wider screens — which doubled the
 * content for a screen reader, doubled every text match in a test, and meant
 * `.first()` could land on the copy that happened to be hidden.
 *
 * Instead: a real table that keeps its semantics at every width, secondary
 * columns dropped on narrow screens, and horizontal scrolling confined to the
 * table's own container so the page itself never scrolls sideways.
 */
export type Column<Row> = {
  key: string
  header: string
  cell: (row: Row) => React.ReactNode
  /** Dropped on phones, where only the essentials fit. */
  secondary?: boolean
  align?: 'start' | 'end'
}

export function DataTable<Row>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  caption,
  emptyState,
  className,
}: {
  rows: readonly Row[]
  columns: readonly Column<Row>[]
  getRowKey: (row: Row) => string
  onRowClick?: (row: Row) => void
  /** Describes the table for screen readers. Required, never decorative. */
  caption: string
  emptyState?: React.ReactNode
  className?: string
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-label">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-caption uppercase tracking-wide text-muted">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-2 text-left font-medium',
                  column.align === 'end' && 'text-right',
                  column.secondary && 'hidden sm:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className={cn(
                'border-b border-border last:border-0',
                onRowClick && 'hover:bg-surface-sunken',
              )}
            >
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-0',
                    column.align === 'end' && 'text-right',
                    column.secondary && 'hidden sm:table-cell',
                  )}
                >
                  {/*
                    A clickable row must be reachable by keyboard, and a <tr>
                    with an onClick is not. The first cell carries a real button
                    that fills the row; the rest are plain content.
                  */}
                  {onRowClick && index === 0 ? (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className="flex min-h-touch w-full items-center py-2 text-left"
                    >
                      {column.cell(row)}
                    </button>
                  ) : (
                    <span className="flex min-h-touch items-center py-2">{column.cell(row)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
