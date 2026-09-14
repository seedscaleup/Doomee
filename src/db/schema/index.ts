/**
 * Drizzle schema root. Intentionally empty at LOT 0.
 *
 * LOT 1 introduces the first tables. Every applicative table must carry
 * organization_id, ENABLE + FORCE row level security, a policy, and an entry
 * in the generated tenant-isolation test suite (CLAUDE.md rule 11).
 */
export {}
