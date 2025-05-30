
import type { Metadata } from 'next';
import { Montserrat, Roboto, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Toaster } from '@/components/ui/toaster';
import QueryProvider from '@/components/layout/QueryProvider';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-title',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NodePass 管理器',
  description: 'NodePass 实例管理。',
  // icons: [{ rel: 'icon', url: '/logo.svg', type: 'image/svg+xml' }], // Using direct link in head for now
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
      </head>
      <body className={`${montserrat.variable} ${roboto.variable} ${jetbrainsMono.variable} antialiased font-sans`}>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
