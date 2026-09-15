import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import {
  computeHealth,
  DEFAULT_HEALTH_WEIGHTS,
  HEALTH_FACTORS,
  type HealthInput,
} from '@/modules/health/service'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

/**
 * ============================================================================
 * THE EXPLANATION, IN BOTH LANGUAGES.
 *
 * A snapshot stores `code` + `params`, NEVER a sentence (ADR-011). This is the
 * test that proves the rendering half works — and that it works in French for
 * one colleague and in English for another, from the same stored row, with no
 * recomputation.
 *
 * A stored sentence would be a sentence in one language forever.
 * ============================================================================
 */
const translators = {
  fr: createTranslator({ locale: 'fr', messages: fr, namespace: 'health' }),
  en: createTranslator({ locale: 'en', messages: en, namespace: 'health' }),
}

const input: HealthInput = {
  progressPercent: 20,
  scheduleElapsedPercent: 60,
  actionsTotal: 10,
  actionsOverdue: 3,
  actionsBlocked: 2,
  deliverablesPendingClient: 1,
  oldestPendingClientDays: 3,
  openRisks: 2,
  criticalRisks: 1,
  busiestAssigneeOpenActions: 9,
  doneActionsWithoutResult: 2,
  milestonesOverdue: 1,
  milestonesTotal: 4,
}

describe('rendering a health factor', () => {
  const reading = computeHealth(input, DEFAULT_HEALTH_WEIGHTS)

  /**
   * Generated from the factor list, so a factor added without a sentence fails
   * here rather than rendering its own code to a user.
   */
  it.each(HEALTH_FACTORS)('has a French and an English sentence for %s', (code) => {
    const factor = reading.factors.find((item) => item.code === code)
    expect(factor, code).toBeDefined()

    for (const [locale, t] of Object.entries(translators)) {
      const sentence = t(`factor.${code}`, factor?.params ?? {})

      expect(sentence, `${code} in ${locale}`).toBeTruthy()
      // next-intl leaves the placeholder in place when a param is missing.
      expect(sentence, `${code} in ${locale}`).not.toMatch(/\{[a-z]+\}/i)
      // And the code itself must never reach a reader.
      expect(sentence, `${code} in ${locale}`).not.toContain(code)
    }
  })

  it.each(HEALTH_FACTORS)('names %s in both languages', (code) => {
    expect(translators.fr(`factorName.${code}`)).toBeTruthy()
    expect(translators.en(`factorName.${code}`)).toBeTruthy()
    expect(translators.fr(`factorName.${code}`)).not.toBe(code)
  })

  /** The same stored row, read by two people, says the same thing twice over. */
  it('renders the same numbers in both languages', () => {
    const overdue = reading.factors.find((item) => item.code === 'overdue_actions')

    expect(translators.fr('factor.overdue_actions', overdue?.params ?? {})).toBe(
      '3 action(s) en retard sur 10.',
    )
    expect(translators.en('factor.overdue_actions', overdue?.params ?? {})).toBe(
      '3 action(s) overdue out of 10.',
    )
  })

  it('renders the schedule gap with its three numbers', () => {
    const gap = reading.factors.find((item) => item.code === 'progress_vs_schedule')

    expect(translators.fr('factor.progress_vs_schedule', gap?.params ?? {})).toBe(
      "40 % de retard sur le calendrier : 60 % du temps écoulé pour 20 % d'avancement.",
    )
    expect(translators.en('factor.progress_vs_schedule', gap?.params ?? {})).toBe(
      '40% behind schedule: 60% of the time gone for 20% done.',
    )
  })

  /**
   * The undated case: `params` is empty, and the sentence must still render
   * rather than leaving `{gap}` on screen. It scores 100, so it is never shown
   * — but a factor that cannot be rendered is one refactor away from being.
   */
  it('renders even when a factor carries no params', () => {
    const undated = computeHealth(
      { ...input, scheduleElapsedPercent: null },
      DEFAULT_HEALTH_WEIGHTS,
    )
    const factor = undated.factors.find((item) => item.code === 'progress_vs_schedule')
    expect(factor?.params).toEqual({})

    for (const t of Object.values(translators)) {
      expect(() => t('factor.progress_vs_schedule', factor?.params ?? {})).not.toThrow()
    }
  })
})
