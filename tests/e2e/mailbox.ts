import { readFileSync } from 'node:fs'

/**
 * Reads the messages the console mail adapter captured during the run, so a
 * test can follow a verification or invitation link exactly as a recipient
 * would — no stubbing, no shortcut around the real flow.
 */
export type CapturedMail = {
  to: string
  subject: string
  text: string
  html: string
  locale: 'fr' | 'en'
}

export function mailbox(): CapturedMail[] {
  const path = process.env.MAIL_CAPTURE_FILE
  if (!path) throw new Error('MAIL_CAPTURE_FILE is not set: run through scripts/e2e.ts')

  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CapturedMail)
}

/**
 * Waits for a message to reach an address, because sending is asynchronous.
 *
 * Pass `subject` whenever the address may hold more than one message. A client
 * contact is invited to the portal AND asked to confirm their address, so
 * "the latest one" depends on which request finished first — and picking the
 * invitation instead of the verification link leaves the account unverified,
 * which then fails at sign-in looking nothing like an ordering problem.
 */
export async function waitForMail(
  to: string,
  options: { subject?: string; timeoutMs?: number } = {},
): Promise<CapturedMail> {
  const timeoutMs = options.timeoutMs ?? 10_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const found = mailbox()
      .filter((message) => message.to === to)
      .filter((message) => options.subject === undefined || message.subject === options.subject)
      .at(-1)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  const subject = options.subject ? ` with subject "${options.subject}"` : ''
  throw new Error(`No mail${subject} reached ${to} within ${timeoutMs}ms`)
}

/** The action link is the last line of the plain-text body. */
export function linkFrom(message: CapturedMail): string {
  const match = message.text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`No link in the message to ${message.to}`)
  return match[0]
}
