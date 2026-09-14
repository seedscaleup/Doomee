import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  type ClientStatus,
  canArchive,
  canTransition,
  normaliseSearch,
  statusTone,
} from '@/modules/clients/service'

const ALL: ClientStatus[] = ['prospect', 'active', 'paused', 'archived']

describe('client status transitions', () => {
  it('always allows staying put', () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(true)
  })

  it('lets a prospect become active', () => {
    expect(canTransition('prospect', 'active')).toBe(true)
  })

  it('never reopens an archived client implicitly', () => {
    // Bringing a client back is a decision, not a dropdown.
    for (const target of ['prospect', 'active', 'paused'] as const) {
      expect(canTransition('archived', target)).toBe(false)
    }
    expect(allowedTransitions('archived')).toEqual([])
  })

  it('never sends a client straight from prospect to paused', () => {
    expect(canTransition('prospect', 'paused')).toBe(false)
  })

  it('lets any live status be archived', () => {
    for (const status of ['prospect', 'active', 'paused'] as const) {
      expect(canTransition(status, 'archived')).toBe(true)
    }
  })
})

describe('status tone', () => {
  it.each([
    ['prospect', 'progress'],
    ['active', 'success'],
    ['paused', 'warning'],
    ['archived', 'neutral'],
  ] as const)('%s reads as %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone)
  })
})

describe('search normalisation', () => {
  it.each([
    ['Côte d’Ivoire', 'cote d’ivoire'],
    ['  MTA  ', 'mta'],
    ['Agence Créative', 'agence creative'],
    ['ÉLÉGANCE', 'elegance'],
  ])('turns %s into %s', (input, expected) => {
    expect(normaliseSearch(input)).toBe(expected)
  })

  it('makes an unaccented query match an accented name', () => {
    // In French, a search that requires the right accent is a search that fails.
    expect(normaliseSearch('Côte').startsWith(normaliseSearch('cote'))).toBe(true)
  })
})

describe('archiving', () => {
  it('refuses while active projects remain', () => {
    expect(canArchive({ activeProjects: 2 })).toEqual({
      allowed: false,
      reason: 'has_active_projects',
    })
  })

  it('allows it once nothing is live', () => {
    expect(canArchive({ activeProjects: 0 }).allowed).toBe(true)
  })
})
