'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Quiz', exact: true },
  { href: '/study/lecture', label: 'Lecture' },
  { href: '/study/flashcards', label: 'Flashcards', disabled: true }
] as const;

export function AppNavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 text-sm">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        if (tab.disabled) {
          return (
            <span
              key={tab.href}
              className="rounded-lg border border-dashed border-neutral-200 px-3 py-1.5 text-neutral-400"
            >
              {tab.label}
            </span>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              active ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
