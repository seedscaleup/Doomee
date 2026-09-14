/**
 * D5 — Architectural boundaries, enforced in CI.
 * CLAUDE.md §5: app -> modules -> db|lib. Never the other way round.
 * ADR-021: no infrastructure SDK outside src/lib/storage and src/lib/mail.
 */
module.exports = {
  forbidden: [
    {
      name: 'app-must-not-touch-db',
      comment:
        'Routes and pages never talk to the database. Go through a module (CLAUDE.md rule 4).',
      severity: 'error',
      from: { path: '^src/app' },
      to: { path: '^src/db' },
    },
    {
      name: 'db-must-not-import-modules',
      comment: 'The database layer knows nothing about domain modules.',
      severity: 'error',
      from: { path: '^src/db' },
      to: { path: '^src/modules' },
    },
    {
      name: 'lib-must-not-import-modules',
      comment: 'Shared infrastructure never depends on a domain module.',
      severity: 'error',
      from: { path: '^src/lib' },
      to: { path: '^src/modules' },
    },
    {
      name: 'modules-use-public-entrypoint',
      comment: 'A module may only import another module through its index.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/.+' },
      to: { path: '^src/modules/(?!$1/)[^/]+/.+', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'no-infra-sdk-outside-adapters',
      comment: 'Hosting SDKs stay behind src/lib/storage and src/lib/mail (ADR-021).',
      severity: 'error',
      from: { pathNot: '^src/lib/(storage|mail)' },
      to: {
        dependencyTypes: ['npm'],
        path: '^(@aws-sdk|@vercel|resend|nodemailer|@supabase|@neondatabase)',
      },
    },
    {
      name: 'service-must-stay-pure',
      comment:
        'service.ts holds pure logic: no database, no server context, no fetch (CLAUDE.md §5).',
      severity: 'error',
      from: { path: 'service\\.ts$' },
      to: { path: '^(src/db|src/server)' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-orphans',
      severity: 'warn',
      // Exempt: framework entrypoints Next discovers by convention; the schema barrel (consumed by
      // drizzle.config.ts, outside the cruise root); app-error.ts, which
      // defineAction wires in at LOT 1 — remove that exemption then.
      from: {
        orphan: true,
        pathNot:
          '(\\.d\\.ts$|^src/(middleware|instrumentation)\\.ts$|^src/app/(layout|not-found|global-error)\\.tsx$|^src/db/schema/index\\.ts$|^src/lib/errors/app-error\\.ts$)',
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^src/db/migrations|\\.test\\.ts$)' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
