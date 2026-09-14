import { appendFileSync } from 'node:fs'
import { logger } from '@/lib/logger'
import type { MailAdapter, MailMessage } from './types'

/**
 * Development and test transport: writes the message to the log instead of
 * sending it. Keeps sign-up testable without an SMTP server, and makes it
 * obvious in the log when a mail would have gone out.
 *
 * MAIL_CAPTURE_FILE additionally appends each message as JSON so end-to-end
 * tests can follow a verification or invitation link. It is a deliberate test
 * seam: inert unless the variable is set, and the variable is only ever set by
 * scripts/e2e.ts.
 */
export function createConsoleMailAdapter(sink?: (message: MailMessage) => void): MailAdapter {
  const capturePath = process.env.MAIL_CAPTURE_FILE

  return {
    name: 'console',
    send: async (message) => {
      sink?.(message)

      if (capturePath) {
        appendFileSync(capturePath, `${JSON.stringify(message)}\n`, 'utf8')
      }

      logger.info(
        { to: message.to, subject: message.subject, locale: message.locale },
        'mail (not sent: console adapter)',
      )
    },
  }
}
