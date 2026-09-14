import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailAdapter, createSmtpMailAdapter, type MailMessage } from '@/lib/mail'

const MESSAGE: MailMessage = {
  to: 'sandra@example.test',
  subject: 'Doomee',
  html: '<p>Bonjour</p>',
  text: 'Bonjour',
  locale: 'fr',
}

describe('mail adapters', () => {
  /**
   * ADR-021 asks for two tested implementations behind the port. One
   * implementation is a guess at portability; two is evidence.
   */
  it('the console adapter hands the message to its sink instead of sending', async () => {
    const captured: MailMessage[] = []
    const adapter = createConsoleMailAdapter((message) => captured.push(message))

    await adapter.send(MESSAGE)

    expect(adapter.name).toBe('console')
    expect(captured).toEqual([MESSAGE])
  })

  it('the SMTP adapter forwards to the transport with the configured sender', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined)
    const adapter = createSmtpMailAdapter(
      { url: 'smtp://localhost:1025', from: 'doomee <no-reply@doomee.app>' },
      { sendMail } as never,
    )

    await adapter.send(MESSAGE)

    expect(adapter.name).toBe('smtp')
    expect(sendMail).toHaveBeenCalledWith({
      from: 'doomee <no-reply@doomee.app>',
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    })
  })

  it('both adapters satisfy the same port', () => {
    const console = createConsoleMailAdapter()
    const smtp = createSmtpMailAdapter({ url: 'smtp://localhost:1025', from: 'x' }, {
      sendMail: async () => undefined,
    } as never)
    expect(typeof console.send).toBe('function')
    expect(typeof smtp.send).toBe('function')
  })
})
