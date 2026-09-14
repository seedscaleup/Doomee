/**
 * Runs the exact artefact we ship (ADR-021): the standalone server, with the
 * static assets laid out beside it the same way the Dockerfile does.
 *
 * E2E must exercise this, not `next start` — otherwise the tests pass against
 * a server that never reaches production.
 */

import { spawn } from 'node:child_process'
import { access, cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const standalone = join(root, '.next/standalone')

async function exists(path) {
  return access(path).then(
    () => true,
    () => false,
  )
}

if (!(await exists(standalone))) {
  console.error('No standalone build found. Run `pnpm build` first.')
  process.exit(1)
}

await mkdir(join(standalone, '.next'), { recursive: true })
await cp(join(root, '.next/static'), join(standalone, '.next/static'), { recursive: true })
if (await exists(join(root, 'public'))) {
  await cp(join(root, 'public'), join(standalone, 'public'), { recursive: true })
}

spawn(process.execPath, [join(standalone, 'server.js')], { stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
)
