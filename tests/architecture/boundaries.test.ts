import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * The dependency-cruiser rules are the contract; this test makes a violation
 * fail the unit suite too, so it surfaces before CI.
 */
describe('architectural boundaries', () => {
  it('satisfies every dependency rule', () => {
    expect(() =>
      execFileSync(
        'pnpm',
        ['exec', 'depcruise', 'src', '--config', 'dependency-cruiser.cjs', '--output-type', 'err'],
        { encoding: 'utf8', stdio: 'pipe' },
      ),
    ).not.toThrow()
  })
})
