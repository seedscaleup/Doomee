import type { Locale } from '@/i18n/routing'
import { translator } from '@/lib/i18n/translator'
import type { MailMessage } from '../types'

/**
 * Plain, typed templates. Rich React Email layouts arrive with the wider
 * notification work in LOT 14; what matters now is that every string comes from
 * the catalogues and the locale is explicit.
 */
type Template = {
  subjectKey: string
  bodyKey: string
  ctaKey: string
}

const TEMPLATES = {
  verifyEmail: { subjectKey: 'verify.subject', bodyKey: 'verify.body', ctaKey: 'verify.cta' },
  resetPassword: { subjectKey: 'reset.subject', bodyKey: 'reset.body', ctaKey: 'reset.cta' },
  magicLink: { subjectKey: 'magic.subject', bodyKey: 'magic.body', ctaKey: 'magic.cta' },
  invitation: {
    subjectKey: 'invitation.subject',
    bodyKey: 'invitation.body',
    ctaKey: 'invitation.cta',
  },
  /**
   * A client contact is not joining a team, they are being given a window onto
   * their own account. Same mechanism, different promise — so different words.
   */
  portalInvitation: {
    subjectKey: 'portalInvitation.subject',
    bodyKey: 'portalInvitation.body',
    ctaKey: 'portalInvitation.cta',
  },
} as const satisfies Record<string, Template>

export type TemplateName = keyof typeof TEMPLATES

export function renderMail(
  name: TemplateName,
  options: { to: string; locale: Locale; url: string; params?: Record<string, string> },
): MailMessage {
  const t = translator(options.locale)
  const template = TEMPLATES[name]
  const values = { ...options.params, url: options.url }

  const subject = t(`emails.${template.subjectKey}`, values)
  const body = t(`emails.${template.bodyKey}`, values)
  const cta = t(`emails.${template.ctaKey}`, values)

  return {
    to: options.to,
    locale: options.locale,
    subject,
    text: `${body}\n\n${cta}: ${options.url}`,
    html: [
      '<div style="font-family:system-ui,sans-serif;color:#111111;background:#FAFAF7;padding:24px">',
      '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E8E3;border-radius:12px;padding:24px">',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(body)}</p>`,
      `<a href="${escapeAttribute(options.url)}" style="display:inline-block;background:#FFD21F;color:#111111;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${escapeHtml(cta)}</a>`,
      `<p style="margin:24px 0 0;font-size:12px;color:#6B6B66">${escapeHtml(options.url)}</p>`,
      '</div></div>',
    ].join(''),
  }
}

/** User-controlled values reach these templates, so both contexts are escaped. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}
