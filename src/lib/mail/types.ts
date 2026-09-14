import type { Locale } from '@/i18n/routing'

/**
 * The mail port (ADR-021). Nothing outside src/lib/mail may import a mail SDK,
 * and the rule is enforced by dependency-cruiser.
 *
 * Two implementations exist, both tested, because an abstraction with a single
 * implementation is only a guess at portability.
 */
export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  /**
   * The RECIPIENT's language, resolved when the message is sent — never the
   * sender's, and never read from a request context (ADR-011).
   */
  locale: Locale
}

export type MailAdapter = {
  readonly name: string
  send: (message: MailMessage) => Promise<void>
}
