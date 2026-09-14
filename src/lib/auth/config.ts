import 'server-only'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { uuidv7 } from 'uuidv7'
import * as schema from '@/db/schema'
import { isLocale, type Locale } from '@/i18n/routing'
import { serverEnv } from '@/lib/env'
import { mailer } from '@/lib/mail'
import { renderMail, type TemplateName } from '@/lib/mail/templates'
import {
  AUTH_RATE_LIMIT_RULES,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitEnabled,
} from './rate-limit'

/**
 * Authentication (ADR-003). Identities and sessions live in OUR database, so
 * there is no third party holding user data and the foreign keys from
 * memberships to users stay real.
 *
 * Better Auth connects as the migrator-grade role rather than app_user: the
 * auth tables deliberately carry no row level security (they are identity, not
 * tenant data) and sign-in has to work before any organisation is resolved.
 * They are never granted to app_portal, so the portal cannot reach them.
 */
let authPool: Pool | undefined

function authDb() {
  authPool ??= new Pool({
    connectionString: serverEnv().DATABASE_AUTH_URL,
    max: 5,
    application_name: 'doomee-auth',
  })
  return drizzle(authPool, { schema })
}

export function createAuth() {
  const env = serverEnv()

  return betterAuth({
    appName: 'doomee',
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,

    database: drizzleAdapter(authDb(), {
      provider: 'pg',
      // Keyed by the modelName configured below ('users', not 'user'): the
      // adapter resolves a model to a schema entry by that name, and a
      // mismatch surfaces only at the first request.
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        rateLimit: schema.rateLimits,
      },
    }),

    rateLimit: {
      enabled: rateLimitEnabled(process.env),
      window: RATE_LIMIT_WINDOW_SECONDS,
      max: RATE_LIMIT_MAX_REQUESTS,
      // Survives a restart and is shared across instances, unlike the default
      // in-memory counter which resets on every deploy.
      storage: 'database',
      customRules: AUTH_RATE_LIMIT_RULES,
    },

    advanced: {
      // uuid v7: time-sortable, and it matches the uuid column type.
      database: { generateId: () => uuidv7() },
      cookiePrefix: 'doomee',
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      // Better Auth's built-in scrypt. Argon2id would mean a native module,
      // which breaks the single portable image of ADR-021 — see ADR-027.
      sendResetPassword: async ({ user, url }) => {
        await sendTemplate('resetPassword', user, url)
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendTemplate('verifyEmail', user, url)
      },
    },

    // Magic links keep friction low for client contacts, who sign in rarely.
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          await mailer().send(renderMail('magicLink', { to: email, locale: 'fr', url }))
        },
      }),
    ],

    user: {
      modelName: 'users',
      additionalFields: {
        locale: { type: 'string', defaultValue: 'fr', input: true },
        reportLocale: { type: 'string', defaultValue: 'fr', input: false },
        timezone: { type: 'string', defaultValue: 'UTC', input: false },
        dateFormat: { type: 'string', defaultValue: 'dd/MM/yyyy', input: false },
        // Never settable from a sign-up payload: a self-served platform admin
        // would be a privilege-escalation hole.
        isPlatformAdmin: { type: 'boolean', defaultValue: false, input: false },
      },
    },

    session: {
      modelName: 'sessions',
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        activeOrganizationId: { type: 'string', required: false, input: false },
      },
    },

    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
  })
}

/**
 * Sends in the RECIPIENT's language, read from their own row (ADR-011) — never
 * from whoever triggered the mail, and never from a request context.
 */
async function sendTemplate(
  template: TemplateName,
  user: { email: string; locale?: unknown },
  url: string,
): Promise<void> {
  const locale = isLocale(String(user.locale)) ? (String(user.locale) as Locale) : 'fr'
  await mailer().send(renderMail(template, { to: user.email, locale, url }))
}

export type Auth = ReturnType<typeof createAuth>

let cached: Auth | undefined

export function auth(): Auth {
  cached ??= createAuth()
  return cached
}
