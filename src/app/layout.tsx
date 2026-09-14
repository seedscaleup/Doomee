/**
 * Pass-through root layout. The real <html>/<body> shell lives in
 * [locale]/layout.tsx, because the lang attribute depends on the locale.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
