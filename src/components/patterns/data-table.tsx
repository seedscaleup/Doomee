'use client'

import { cn } from '@/lib/utils'

/**
 * One list component for every list screen.
 *
 * The value it carries is not the markup, it is the RESPONSIVE behaviour: a
 * table on a wide screen, a stack of cards on a phone, from a single column
 * description. Written once here, every list gets it; written per screen, half
 * of them would quietly overflow at 375px.
 */
export type Column<Row> = {
  key: string
  header: string
  /** Rendered in both layouts. */
  cell: (row: Row) => React.ReactNode
  /** Hidden on phones, where only the essentials fit. */
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

  const primary = columns.filter((column) => !column.secondary)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Phones: one card per row, primary columns only. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)}>
            <RowShell onClick={onRowClick ? () => onRowClick(row) : undefined}>
              <span className="flex min-w-0 flex-col gap-1">
                {primary.map((column) => (
                  <span key={column.key} className="min-w-0 truncate">
                    {column.cell(row)}
                  </span>
                ))}
              </span>
            </RowShell>
          </li>
        ))}
      </ul>

      {/* Wider screens: a real table, so columns line up and can be scanned. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-label">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-caption uppercase tracking-wide text-muted">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('px-3 py-2 font-medium', column.align === 'end' && 'text-right')}
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
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-sunken',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3 py-3', column.align === 'end' && 'text-right')}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowShell({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const className =
    'flex w-full min-h-touch items-center gap-3 rounded-doomee border border-border bg-surface px-3 py-3 text-left'

  // A clickable row must be a real button: a div with onClick is invisible to
  // the keyboard and to assistive technology.
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  )
}
