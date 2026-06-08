import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Bricolage_Grotesque } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { SplashScreen } from '@/components/app/splash-screen';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Finby — your money, your buddy',
  description: 'Conversational personal finance. Log expenses, track budgets, and get honest guidance — just by chatting.',
  applicationName: 'Finby',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Finby' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#06101f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <SplashScreen />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
