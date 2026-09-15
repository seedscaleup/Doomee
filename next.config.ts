import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // ADR-021: a standalone build runs identically on any container host.
  // Never rely on a hosting provider's proprietary runtime.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // Keep server-action payloads small; results forms stay well under this.
    serverActions: { bodySizeLimit: '2mb' },
  },
  /**
   * `@react-pdf/renderer` reaches PDFKit, which is a Node library: it opens
   * files and uses Node streams. Bundling it into the server chunks rewrites
   * those requires and breaks them.
   */
  serverExternalPackages: ['@react-pdf/renderer'],
  /**
   * PDFKit loads its standard fonts by BUILDING A PATH AT RUNTIME, so Next's
   * dependency tracer cannot see them and leaves them out of the standalone
   * output. The symptom is only visible in the artefact that actually ships:
   *
   *   Cannot find module '…/pdfkit/js/standard-fonts/Helvetica.cjs'
   *
   * which an E2E run against `output: 'standalone'` surfaced. Naming them here
   * is what makes the export work on a container that was built, not served
   * from a developer's node_modules (ADR-021).
   */
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**'],
  },
}

export default withNextIntl(nextConfig)
