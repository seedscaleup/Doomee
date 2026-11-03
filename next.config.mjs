/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    serverActions: { bodySizeLimit: '2mb' }
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }]
  }
};

export default nextConfig;
