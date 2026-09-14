import { serverEnv } from '@/lib/env'
import { createConsoleMailAdapter } from './console-adapter'
import { createSmtpMailAdapter } from './smtp-adapter'
import type { MailAdapter } from './types'

let adapter: MailAdapter | undefined

/** SMTP when configured, console otherwise — so a missing SMTP_URL never blocks local work. */
export function mailer(): MailAdapter {
  if (adapter) return adapter
  const env = serverEnv()

  adapter = env.SMTP_URL
    ? createSmtpMailAdapter({ url: env.SMTP_URL, from: env.MAIL_FROM })
    : createConsoleMailAdapter()

  return adapter
}

/** Test seam: lets a suite install a capturing adapter. */
export function setMailer(next: MailAdapter | undefined): void {
  adapter = next
}

export { createConsoleMailAdapter } from './console-adapter'
export { createSmtpMailAdapter } from './smtp-adapter'
export type { MailAdapter, MailMessage } from './types'
