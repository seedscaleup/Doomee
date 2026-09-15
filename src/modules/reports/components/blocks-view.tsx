import type { ReportBlock, ReportCell } from '../present'

/**
 * ============================================================================
 * A SECTION'S DATA, ON SCREEN.
 *
 * The same blocks the PDF renders (`presentSection`), rendered in HTML. Three
 * surfaces show them — the editor, the share page and the client portal — which
 * is exactly rule 8's third occurrence, and exactly the reason it matters here:
 * if the editor shaped its own rows, an agency would approve one document and
 * send another.
 *
 * No hooks, and the words arrive as a PROP: they are resolved on the server in
 * the REPORT's language (`resolveLabels`), which is not the reader's. A client
 * component only holds the reader's catalogue, so translating here would have
 * put French headings above an English document.
 * ============================================================================
 */
export function BlocksView({
  blocks,
  emptyLabel,
  labels,
}: {
  blocks: ReportBlock[]
  emptyLabel: string
  /** Built by `resolveLabels`, in the report's language. */
  labels: Record<string, string>
}) {
  const translate = (key: string) => labels[key] ?? key.split('.').at(-1) ?? key

  const empty = blocks.every((block) =>
    block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0,
  )

  if (empty) return <p className="text-caption text-muted">{emptyLabel}</p>

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        // Blocks are a fixed, ordered list from one presenter — position IS
        // the identity, and there is no id to key on.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional by construction
        <Block key={index} block={block} translate={translate} />
      ))}
    </div>
  )
}

function Block({ block, translate }: { block: ReportBlock; translate: (key: string) => string }) {
  if (block.kind === 'stats') {
    if (block.items.length === 0) return null

    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {block.items.map((item) => (
          <li
            key={item.labelKey}
            className="rounded-doomee border border-border bg-background px-3 py-2"
          >
            <p className="text-title font-bold tabular-nums">{item.value}</p>
            <p className="text-caption text-muted">{translate(item.labelKey)}</p>
          </li>
        ))}
      </ul>
    )
  }

  if (block.kind === 'notes') {
    if (block.items.length === 0) return null

    return (
      <ul className="flex flex-col gap-3">
        {block.items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: two notes may share a title
          <li key={index} className="border-border border-l-2 pl-3">
            <p className="font-medium">{item.title}</p>
            <p className="whitespace-pre-line text-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    )
  }

  if (block.rows.length === 0) return null

  return (
    // A table that cannot fit scrolls ITSELF, never the page (ADR-049).
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="border-black border-b">
            {block.columnKeys.map((key) => (
              <th key={key} scope="col" className="py-2 pr-3 text-caption font-semibold uppercase">
                {translate(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows carry no stable id here
            <tr key={index} className="border-border border-b">
              {row.map((cell, column) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: column position is the identity
                  key={column}
                  className={`py-2 pr-3 align-top ${toneClass(cell.tone)}`}
                >
                  {cell.key === undefined ? cell.text : translate(cell.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The `-text` siblings, never the flat tokens (ADR-032): these colours carry
 * text, and `text-success` fails contrast where `text-success-text` passes.
 */
function toneClass(tone: ReportCell['tone']): string {
  if (tone === 'success') return 'text-success-text'
  if (tone === 'danger') return 'text-danger-text'
  if (tone === 'muted') return 'text-muted'
  return ''
}
