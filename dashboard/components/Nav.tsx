'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, Lightbulb, Users, Layers, ChevronDown, ChevronRight } from 'lucide-react'
import { useRole, type Role } from '@/context/RoleContext'

const roleOptions: { value: Role; label: string }[] = [
  { value: 'manager', label: 'SDR Manager' },
  { value: 'revops', label: 'RevOps Lead' },
  { value: 'rep', label: 'Rep' },
]

type NavItemProps = {
  href: string
  label: string
  icon: React.ReactNode
  active?: boolean
}

function NavItem({ href, label, icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-[16px] font-mono no-underline transition-colors duration-150"
      style={{
        border: active ? '1px solid #252525' : '1px solid transparent',
        background: active ? '#161616' : 'transparent',
        color: active ? '#e5e5e5' : '#555',
      }}
    >
      <span className="flex items-center shrink-0" style={{ color: active ? '#3b82f6' : '#444' }}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  )
}

type SectionHeaderProps = {
  label: string
  expanded?: boolean
  onToggle?: () => void
  disabled?: boolean
  badge?: string
}

function SectionHeader({ label, expanded, onToggle, disabled, badge }: SectionHeaderProps) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      className="flex items-center gap-1.5 w-full px-2 py-1 font-mono text-[11px] uppercase tracking-wider"
      style={{
        background: 'transparent',
        border: 'none',
        color: disabled ? '#333' : '#666',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <ChevronIcon size={12} />
      <span>{label}</span>
      {badge && (
        <span
          className="ml-auto text-[9px] font-sans rounded px-1.5 py-0.5"
          style={{
            background: '#1a1a1a',
            color: '#444',
            border: '1px solid #252525',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export default function Nav() {
  const pathname = usePathname()
  const [loopExpanded, setLoopExpanded] = useState(true)
  const { role, setRole } = useRole()

  return (
    <nav
      className="flex flex-col shrink-0 sticky top-0"
      style={{
        width: '200px',
        height: '100vh',
        background: '#0a0a0a',
        borderRight: '1px solid #1c1c1c',
      }}
    >
      {/* BEACON wordmark */}
      <div className="px-4 pt-5 pb-3" style={{ borderBottom: '1px solid #1c1c1c' }}>
        <span
          className="font-mono text-[18px] font-semibold tracking-wide"
          style={{ color: '#e5e5e5' }}
        >
          beacon<span style={{ color: '#3b82f6' }}>.</span>
        </span>
      </div>

      {/* Module sections */}
      <div className="flex flex-col px-2 pt-3 gap-0.5">
        {/* Loop section */}
        <SectionHeader
          label="Loop"
          expanded={loopExpanded}
          onToggle={() => setLoopExpanded(!loopExpanded)}
        />

        {loopExpanded && (
          <div className="flex flex-col gap-0.5 pl-2 mt-0.5">
            <NavItem
              href="/"
              label="Overview"
              icon={<LayoutDashboard size={15} />}
              active={pathname === '/'}
            />
            <NavItem
              href="/insights"
              label="Insights"
              icon={<Lightbulb size={15} />}
              active={pathname === '/insights'}
            />
            <NavItem
              href="/reps"
              label="Reps"
              icon={<Users size={15} />}
              active={pathname.startsWith('/reps')}
            />
            <NavItem
              href="/sequences"
              label="Sequences"
              icon={<Layers size={15} />}
              active={pathname.startsWith('/sequences')}
            />
          </div>
        )}

        {/* Signal section — coming soon */}
        <div className="mt-3">
          <SectionHeader
            label="Signal"
            expanded={false}
            disabled
            badge="Coming soon"
          />
        </div>

        {/* Graph section — coming soon */}
        <div className="mt-1">
          <SectionHeader
            label="Graph"
            expanded={false}
            disabled
            badge="Coming soon"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto" style={{ borderTop: '1px solid #1c1c1c' }}>
        {/* Role selector */}
        <div className="px-3 pt-3 pb-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full font-mono text-[13px] rounded cursor-pointer outline-none"
            style={{
              color: '#888',
              background: '#0f0f0f',
              border: '1px solid #1c1c1c',
              padding: '4px 28px 4px 8px',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#333' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#1c1c1c' }}
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pipeline status */}
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <span
            className="shrink-0 rounded-full"
            style={{ width: '6px', height: '6px', background: '#22c55e' }}
          />
          <span className="font-mono text-[12px]" style={{ color: '#333' }}>
            pipeline live
          </span>
        </div>
      </div>
    </nav>
  )
}
