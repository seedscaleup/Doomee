'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { useRouter } from '@/i18n/navigation'
import type { ShellNavItem } from './nav-item'

/**
 * Jump anywhere with the keyboard. "Less typing" applies to navigation too:
 * three keystrokes beat three clicks through a menu.
 *
 * It searches only entries the menu already contains, so it can never offer a
 * destination the actor is not allowed to reach.
 */
export function CommandPalette({
  items,
  label,
  hint,
  noResults,
}: {
  items: readonly ShellNavItem[]
  label: string
  hint: string
  noResults: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Focus the field when the palette opens. Done here rather than with the
  // autoFocus attribute: autoFocus fires on mount, and the dialog mounts
  // closed, so the field would never actually receive focus.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const results = useMemo(() => {
    const needle = normalise(query)
    if (!needle) return items
    return items.filter((item) => normalise(item.label).includes(needle))
  }, [items, query])

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href as '/app')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-touch items-center gap-2 rounded-doomee border border-border bg-surface px-3 text-label text-muted hover:bg-surface-sunken"
      >
        <span>{label}</span>
        <kbd className="ml-auto hidden rounded-doomee-sm border border-border px-1.5 py-0.5 text-caption sm:inline">
          {hint}
        </kbd>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <input
          type="search"
          ref={inputRef}
          value={query}
          aria-label={label}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-touch w-full rounded-doomee border border-border bg-surface px-3 text-base"
        />

        {results.length === 0 ? (
          <p className="text-label text-muted">{noResults}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  className="flex min-h-touch w-full items-center rounded-doomee px-3 text-left text-label hover:bg-surface-sunken"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}

/** Accent-insensitive match: "resultats" should find "Résultats". */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
