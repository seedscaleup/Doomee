import { createTransport, type Transporter } from 'nodemailer'
import type { MailAdapter, MailMessage } from './types'

/**
 * SMTP is the default production transport precisely because every provider
 * speaks it: moving from one EU sender to another is a configuration change,
 * not a code change (ADR-021).
 */
export type SmtpSettings = {
  url: string
  from: string
}

export function createSmtpMailAdapter(
  settings: SmtpSettings,
  transporter?: Transporter,
): MailAdapter {
  const transport = transporter ?? createTransport(settings.url)

  return {
    name: 'smtp',
    send: async (message: MailMessage) => {
      await transport.sendMail({
        from: settings.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    },
  }
}
