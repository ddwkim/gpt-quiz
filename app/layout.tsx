import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppNavTabs } from '@/components/AppNavTabs';

export const metadata = {
  title: 'Quiz from ChatGPT Share',
  description: 'Generate structured quizzes from ChatGPT shared conversations.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
              <Link href="/" className="text-lg font-semibold text-neutral-900">
                Study
              </Link>
              <AppNavTabs />
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
