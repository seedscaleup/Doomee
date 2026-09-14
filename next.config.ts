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
}

export default withNextIntl(nextConfig)
