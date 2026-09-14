import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: { alias: { '@': resolve(root, './src') } },
  test: {
    projects: [
      {
        resolve: { alias: { '@': resolve(root, './src') } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': resolve(root, './src') } },
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
