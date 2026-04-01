'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-[#262626] bg-[#0f0f0f] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
        <span className="font-mono text-slate-100 font-semibold text-sm tracking-tight">
          Beacon Loop
        </span>
        <NavLink href="/" active={pathname === '/'}>
          Home
        </NavLink>
        <NavLink href="/underperforming" active={pathname === '/underperforming'}>
          Underperforming
        </NavLink>
      </div>
    </nav>
  )
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`font-sans text-sm transition-colors duration-200 cursor-pointer pb-[2px] ${
        active
          ? 'text-slate-100 border-b-2 border-[#1e40af]'
          : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      {children}
    </Link>
  )
}
