/**
 * D8 — Observability hook. No-op without SENTRY_DSN so LOT 0 is never blocked
 * on creating an account. Sentry is wired in during LOT 15 hardening.
 */
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  // LOT 15: initialise the Sentry Node SDK here (EU region DSN).
}
