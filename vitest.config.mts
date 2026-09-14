import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname
const SERVER_ONLY_STUB = resolve(root, './tests/helpers/server-only-stub.ts')

export default defineConfig({
  resolve: { alias: { '@': resolve(root, './src'), 'server-only': SERVER_ONLY_STUB } },
  test: {
    projects: [
      {
        resolve: { alias: { '@': resolve(root, './src'), 'server-only': SERVER_ONLY_STUB } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': resolve(root, './src'), 'server-only': SERVER_ONLY_STUB } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Testcontainers needs room to pull and boot PostgreSQL (D7).
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
