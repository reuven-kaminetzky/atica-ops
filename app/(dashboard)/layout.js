'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { section: 'Catalog', items: [
    { href: '/products', label: 'Master Products', icon: '▤' },
    { href: '/stock', label: 'Stock', icon: '▦' },
  ]},
  { section: 'Operations', items: [
    { href: '/purchase-orders', label: 'Purchase Orders', icon: '◫' },
    { href: '/vendors', label: 'Vendors', icon: '⊞' },
    { href: '/cash-flow', label: 'Cash Flow', icon: '◈' },
  ]},
  { section: 'Intelligence', items: [
    { href: '/analytics', label: 'Analytics', icon: '◩' },
  ]},
  { section: 'System', items: [
    { href: '/settings', label: 'Settings', icon: '⚙' },
  ]},
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 250, background: '#714b67', color: 'white',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
    }}>
      <Link href="/" style={{
        padding: '1rem 1.25rem', fontWeight: 700, fontSize: '1.1rem',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        color: 'white', textDecoration: 'none',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        Atica Man <span style={{ opacity: 0.6, fontWeight: 400, fontSize: '0.75rem' }}>OPS</span>
      </Link>

      {NAV.map(section => (
        <div key={section.section} style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)',
            padding: '0 1.25rem', marginBottom: '0.35rem',
          }}>
            {section.section}
          </div>
          {section.items.map(item => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.5rem 1.25rem', fontSize: '0.85rem',
                color: active ? 'white' : 'rgba(255,255,255,0.75)',
                background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                fontWeight: active ? 600 : 400,
                textDecoration: 'none', transition: 'background 0.12s',
              }}>
                <span style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{
        marginLeft: 250, flex: 1, padding: '1.5rem 2rem',
        maxWidth: 1200,
      }}>
        {children}
      </main>
    </div>
  );
}
