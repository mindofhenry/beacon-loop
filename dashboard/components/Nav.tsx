'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'

const monoBase: CSSProperties = {
  fontFamily: 'IBM Plex Mono, monospace',
}

const sectionLabel: CSSProperties = {
  ...monoBase,
  fontSize: '9px',
  color: '#333',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '0 8px 6px',
}

function NavItem({
  href,
  label,
  active,
  disabled,
}: {
  href: string
  label: string
  active?: boolean
  disabled?: boolean
}) {
  const dot: CSSProperties = {
    width: '5px',
    height: '5px',
    flexShrink: 0,
    borderRadius: '50%',
    background: active ? '#3b82f6' : '#333',
  }

  const text: CSSProperties = {
    ...monoBase,
    fontSize: '11px',
    color: active ? '#e5e5e5' : '#555',
  }

  const item: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    borderRadius: '4px',
    border: active ? '1px solid #252525' : '1px solid transparent',
    background: active ? '#161616' : 'transparent',
    cursor: disabled ? 'not-allowed' : undefined,
    textDecoration: 'none',
  }

  if (disabled) {
    return (
      <div style={item}>
        <span style={dot} />
        <span style={text}>{label}</span>
      </div>
    )
  }

  return (
    <Link href={href} style={item}>
      <span style={dot} />
      <span style={text}>{label}</span>
    </Link>
  )
}

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        width: '192px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
        borderRight: '1px solid #1c1c1c',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #1c1c1c' }}>
        <span
          style={{
            ...monoBase,
            fontSize: '12px',
            fontWeight: 500,
            color: '#e5e5e5',
            letterSpacing: '0.02em',
          }}
        >
          beacon<span style={{ color: '#3b82f6' }}>_loop</span>
        </span>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: '2px' }}>
        <div style={sectionLabel}>OVERVIEW</div>
        <NavItem href="/" label="sequences" active={pathname === '/'} />
        <NavItem href="/underperforming" label="underperforming" active={pathname === '/underperforming'} />

        <div style={{ ...sectionLabel, marginTop: '12px' }}>TOOLS</div>
        <NavItem href="/rewrites" label="rewrites" disabled />
        <NavItem href="/compare" label="compare" disabled />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid #1c1c1c',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            flexShrink: 0,
            borderRadius: '50%',
            background: '#22c55e',
          }}
        />
        <span style={{ ...monoBase, fontSize: '10px', color: '#333' }}>pipeline live</span>
      </div>
    </nav>
  )
}
