'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { section: 'CATALOG', items: [
    { href: '/products', label: 'Master Products', icon: '▤' },
    { href: '/stock', label: 'Stock', icon: '▦' },
  ]},
  { section: 'OPERATIONS', items: [
    { href: '/purchase-orders', label: 'Purchase Orders', icon: '◫' },
    { href: '/vendors', label: 'Vendors', icon: '⊞' },
    { href: '/cash-flow', label: 'Cash Flow', icon: '◈' },
    { href: '/warehouse', label: 'Warehouse', icon: '⊡' },
    { href: '/store', label: 'Store', icon: '⊟' },
  ]},
  { section: 'INTELLIGENCE', items: [
    { href: '/analytics', label: 'Analytics', icon: '◩' },
  ]},
  { section: 'SYSTEM', items: [
    { href: '/settings', label: 'Settings', icon: '⚙' },
  ]},
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-sunken">
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-brand text-white flex items-center px-4 z-50 lg:hidden">
        <button onClick={() => setOpen(!open)} className="w-8 h-8 flex items-center justify-center text-lg cursor-pointer bg-transparent border-none text-white">
          {open ? '✕' : '☰'}
        </button>
        <Link href="/" className="flex items-center gap-2 ml-3 no-underline text-white">
          <span className="text-lg font-bold tracking-tight">Atica Man</span>
          <span className="text-[10px] font-medium tracking-widest text-white/50 uppercase">OPS</span>
        </Link>
      </header>

      {/* Sidebar overlay (mobile) */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 bottom-0 w-60 bg-brand text-white flex flex-col overflow-y-auto z-50 transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        {/* Logo (desktop only — mobile has header) */}
        <Link href="/" className="hidden lg:flex items-center gap-2 px-5 py-4 border-b border-white/10 no-underline text-white hover:bg-white/5">
          <span className="text-lg font-bold tracking-tight">Atica Man</span>
          <span className="text-[10px] font-medium tracking-widest text-white/50 uppercase">OPS</span>
        </Link>

        {/* Close button on mobile */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 lg:hidden">
          <span className="text-lg font-bold">Menu</span>
          <button onClick={() => setOpen(false)} className="text-white/70 text-lg cursor-pointer bg-transparent border-none text-white">✕</button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 py-2">
          {NAV.map(section => (
            <div key={section.section} className="mb-1">
              <div className="px-5 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-white/40">
                {section.section}
              </div>
              {section.items.map(item => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 px-5 py-2.5 text-[13px] no-underline transition-colors ${
                      active
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-white/70 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <span className="w-4 text-center text-xs">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-white/10 text-[10px] text-white/30">
          v3.0 · Next.js + Postgres
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 pt-20 lg:pt-6 lg:ml-60 lg:p-6 max-w-[1200px]">
        {children}
      </main>
    </div>
  );
}
