import { describe, expect, it } from 'vitest'
import { defaultOrganizationName, disambiguateSlug, slugify } from '@/modules/organizations/service'

describe('slugify', () => {
  it.each([
    ['Agence Créative', 'agence-creative'],
    ['MTA Côte d’Ivoire', 'mta-cote-d-ivoire'],
    ['  Doomee  ', 'doomee'],
    ['A&B // Conseil', 'a-b-conseil'],
    ['Ünïcödé Ågency', 'unicode-agency'],
  ])('turns %s into %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('---abc---')).toBe('abc')
  })

  it('caps the length so it always fits the column', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})

describe('smart defaults', () => {
  it('names the first organisation after the person (UX principle 4)', () => {
    expect(defaultOrganizationName('Sandra Kouamé')).toBe('Sandra Kouamé')
  })

  it('falls back to the product name rather than an empty one', () => {
    expect(defaultOrganizationName('   ')).toBe('doomee')
  })
})

describe('slug collisions', () => {
  it('leaves the first attempt untouched', () => {
    expect(disambiguateSlug('agence', 0)).toBe('agence')
  })

  it('appends a discriminator rather than failing a sign-up', () => {
    expect(disambiguateSlug('agence', 1)).toBe('agence-2')
    expect(disambiguateSlug('agence', 2)).toBe('agence-3')
  })

  it('keeps the result within the column limit', () => {
    const long = 'a'.repeat(60)
    expect(disambiguateSlug(long, 9).length).toBeLessThanOrEqual(60)
  })
})
