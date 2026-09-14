'use client'

import { inferAdditionalFields, magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
// Type-only: erased at compile time, so no server code reaches the bundle.
import type { Auth } from './config'

/**
 * Browser-side auth. It only ever talks to /api/auth, so no secret and no
 * database credential reaches the client bundle.
 */
export const authClient = createAuthClient({
  // Teaches the client about our additional user fields (locale, timezone…),
  // so they are type-checked at the call site instead of silently dropped.
  plugins: [inferAdditionalFields<Auth>(), magicLinkClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
