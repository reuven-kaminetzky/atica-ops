/**
 * components/ui/index.js — Shared UI Components
 * 
 * Every page imports from here. No more inline style={} duplication.
 */

'use client';

// ── Stat Card ──────────────────────────────────────────────

export function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 8,
      padding: '0.65rem 0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 600, color: '#9ba3b5',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem',
      }}>{label}</div>
      <div style={{
        fontSize: '1.2rem', fontWeight: 700, color: color || '#1e2330',
        letterSpacing: '-0.02em',
      }}>{value ?? '—'}</div>
    </div>
  );
}

// ── Page Header ────────────────────────────────────────────

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: '1.5rem',
    }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '0.82rem', color: '#5f6880', marginTop: '0.25rem' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Section (white card with title) ────────────────────────

export function Section({ title, children }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
      padding: '1rem 1.15rem', marginBottom: '1rem',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {title && (
        <h2 style={{
          fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem',
          paddingBottom: '0.5rem', borderBottom: '1px solid #f0f2f5',
        }}>{title}</h2>
      )}
      {children}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────

const BADGE_COLORS = {
  green:  { bg: '#dcfce7', color: '#16a34a' },
  red:    { bg: '#fef2f2', color: '#dc2626' },
  yellow: { bg: '#fef3c7', color: '#ca8a04' },
  blue:   { bg: '#dbeafe', color: '#1d4ed8' },
  purple: { bg: '#ede9fe', color: '#7c3aed' },
  gray:   { bg: '#f0f2f5', color: '#5f6880' },
  orange: { bg: '#ffedd5', color: '#ea580c' },
  cyan:   { bg: '#cffafe', color: '#0891b2' },
};

export function Badge({ children, variant = 'gray' }) {
  const c = BADGE_COLORS[variant] || BADGE_COLORS.gray;
  return (
    <span style={{
      padding: '0.12rem 0.45rem', borderRadius: 4,
      fontSize: '0.72rem', fontWeight: 600,
      background: c.bg, color: c.color,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── Empty State ────────────────────────────────────────────

export function EmptyState({ title, description, action }) {
  return (
    <div style={{
      textAlign: 'center', padding: '3rem', color: '#9ba3b5',
      background: 'white', borderRadius: 10, border: '1px solid #e5e8ed',
    }}>
      <p style={{ fontSize: '1.05rem', marginBottom: '0.35rem', color: '#5f6880' }}>{title}</p>
      {description && <p style={{ fontSize: '0.82rem' }}>{description}</p>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}

// ── Button ─────────────────────────────────────────────────

export function Button({ children, onClick, href, variant = 'default', disabled, loading, type = 'button' }) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const style = {
    padding: '0.5rem 1.15rem', borderRadius: 6, fontSize: '0.82rem',
    fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    textDecoration: 'none', display: 'inline-block',
    border: isPrimary ? '1px solid #714b67' : isDanger ? '1px solid #dc2626' : '1px solid #d5d9e0',
    background: isPrimary ? '#714b67' : isDanger ? '#dc2626' : 'white',
    color: isPrimary || isDanger ? 'white' : '#1e2330',
    opacity: disabled || loading ? 0.5 : 1,
  };

  if (href) {
    return <a href={href} style={style}>{children}</a>;
  }
  return <button type={type} onClick={onClick} disabled={disabled || loading} style={style}>
    {loading ? 'Working...' : children}
  </button>;
}

// ── Data Table ─────────────────────────────────────────────

export function DataTable({ columns, rows, onRowClick, emptyText = 'No data' }) {
  if (rows.length === 0) {
    return <EmptyState title={emptyText} />;
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
      overflow: 'auto', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8f9fb' }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '0.6rem 0.85rem', fontSize: '0.68rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9ba3b5',
                textAlign: col.align || 'left', whiteSpace: 'nowrap',
                borderBottom: '1px solid #e5e8ed',
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                borderBottom: '1px solid #f0f2f5',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '0.6rem 0.85rem', fontSize: '0.82rem',
                  textAlign: col.align || 'left',
                  fontWeight: col.bold ? 600 : 400,
                  color: col.dim ? '#5f6880' : '#1e2330',
                }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Metric Row (for detail pages) ──────────────────────────

export function MetricGrid({ children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: '0.65rem', marginBottom: '1rem',
    }}>{children}</div>
  );
}

// ── Input Field ────────────────────────────────────────────

export function Field({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label style={{
        display: 'block', fontSize: '0.75rem', fontWeight: 600,
        color: '#5f6880', marginBottom: '0.25rem',
      }}>{label}{required && ' *'}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        style={{
          width: '100%', padding: '0.5rem 0.65rem', borderRadius: 6,
          border: '1px solid #d5d9e0', fontSize: '0.85rem',
          background: 'white', outline: 'none', boxSizing: 'border-box',
        }} />
    </div>
  );
}
