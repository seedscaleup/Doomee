import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname
const SERVER_ONLY_STUB = resolve(root, './tests/helpers/server-only-stub.ts')

export default defineConfig({
  /**
   * The report PDF is a React tree (`@react-pdf/renderer`), so the suites that
   * render one have to compile JSX. Declared once at the root rather than per
   * project: a unit test that renders a document and an integration test that
   * exports one must not compile the same file two different ways.
   */
  // `tsconfig.json` says `"jsx": "preserve"` because Next compiles the JSX
  // itself. Vitest has no Next pipeline, so it is told here instead.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': resolve(root, './src'), 'server-only': SERVER_ONLY_STUB } },
  test: {
    /**
     * CLAUDE.md rule 10: the PURE layer is covered at 90 % or more, and the
     * threshold BLOCKS. A rule that only lives in a document is a rule that
     * quietly stops being true.
     *
     * Coverage is a ROOT option — declared inside a project it is silently
     * ignored, and the report then counts test helpers as product code.
     *
     * Scoped to the pure files on purpose: `service.ts` and the two engines the
     * Results module is built on. Queries and mutations are proven against a
     * real database by the integration suite; counting their lines here would
     * buy a bigger number and less truth.
     */
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/**/service.ts',
        'src/modules/results/form-engine.ts',
        'src/modules/results/derived-metrics.ts',
        // Pure like a service, and the file that decides what a client reads
        // in a PDF — including the decimal arithmetic ADR-050 exists for.
        'src/modules/reports/present.ts',
        'src/modules/reports/tokens.ts',
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ['text'],
    },
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
