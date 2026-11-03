import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getLang } from '@/lib/auth';
import { I18nProvider } from '@/components/I18nProvider';

export const metadata: Metadata = {
  title: 'DOOMEE',
  description: 'Planifier, réaliser, mesurer : le pilotage quotidien de l’équipe.',
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-192x192.png', sizes: '192x192', type: 'image/png' }
    ],
    apple: '/icons/favicon-180x180.png'
  },
  manifest: '/manifest.webmanifest'
};

export const viewport: Viewport = {
  themeColor: '#FFD43B',
  width: 'device-width',
  initialScale: 1
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="min-h-screen bg-paper font-sans text-ink">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
