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

/** Waits for a message to reach an address, because sending is asynchronous. */
export async function waitForMail(to: string, timeoutMs = 10_000): Promise<CapturedMail> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const found = mailbox()
      .filter((message) => message.to === to)
      .at(-1)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`No mail reached ${to} within ${timeoutMs}ms`)
}

/** The action link is the last line of the plain-text body. */
export function linkFrom(message: CapturedMail): string {
  const match = message.text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`No link in the message to ${message.to}`)
  return match[0]
}
