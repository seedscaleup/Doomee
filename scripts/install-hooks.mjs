/**
 * Installs the Git hooks, but only where they make sense.
 *
 * `pnpm install` also runs inside the Docker build, where .git is excluded by
 * .dockerignore — lefthook would fail there and break the image build. Skipping
 * explicitly is better than `|| true`, which would also swallow a real failure
 * on a developer machine.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!existsSync('.git')) {
  console.warn('No .git directory — skipping Git hook installation.')
  process.exit(0)
}

const result = spawnSync('lefthook', ['install'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
