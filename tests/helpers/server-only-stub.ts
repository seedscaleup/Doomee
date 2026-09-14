/**
 * `server-only` throws on import outside a React Server Component graph, which
 * includes Vitest. Aliasing it to this no-op lets the integration suite import
 * the real server modules; the guard still does its job in the Next build,
 * which is the only place it matters.
 */
export {}
