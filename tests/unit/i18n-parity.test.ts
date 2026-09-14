import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, isLocale, LOCALES } from '@/i18n/routing'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

type Messages = Record<string, unknown>

function flatten(value: Messages, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child !== null && typeof child === 'object' ? flatten(child as Messages, path) : [path]
  })
}

function valueAt(source: Messages, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== 'object') return undefined
    return (acc as Messages)[segment]
  }, source)
}

describe('i18n catalogues', () => {
  const frKeys = flatten(fr as Messages)
  const enKeys = flatten(en as Messages)

  it('declares every supported locale', () => {
    expect(LOCALES).toEqual(['fr', 'en'])
    expect(isLocale(DEFAULT_LOCALE)).toBe(true)
    expect(isLocale('de')).toBe(false)
  })

  it('has no key present in fr but missing in en', () => {
    expect(frKeys.filter((key) => !enKeys.includes(key))).toEqual([])
  })

  it('has no key present in en but missing in fr', () => {
    expect(enKeys.filter((key) => !frKeys.includes(key))).toEqual([])
  })

  it.each([
    ['fr', fr],
    ['en', en],
  ])('has no empty or placeholder value in %s', (_locale, catalogue) => {
    const empty = flatten(catalogue as Messages).filter((key) => {
      const value = valueAt(catalogue as Messages, key)
      return typeof value !== 'string' || value.trim().length === 0 || value.startsWith('TODO')
    })
    expect(empty).toEqual([])
  })
})
