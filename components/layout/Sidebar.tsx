'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

interface SidebarProps {
  role: string
  userName: string
  needsActionCount?: number
}

interface NavItem {
  label: string
  href: string
  icon: string
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Leads', href: '/dashboard', icon: '📋' },
  { label: 'Calendar', href: '/calendar', icon: '📅' },
  { label: 'Commission', href: '/commission', icon: '💰' },
  { label: 'Audit Log', href: '/audit', icon: '📁' },
  { label: 'Settings', href: '/settings', icon: '⚙️' },
  { label: 'Users', href: '/users', icon: '👥' },
]

const clientNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Financials', href: '/commission', icon: '💰' },
]

const subcontractorNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'New Jobs', href: '/jobs', icon: '🔧' },
  { label: 'Jobs Booked', href: '/jobs-booked', icon: '📅' },
  { label: 'Completed Jobs', href: '/completed-jobs', icon: '✅' },
]

export default function Sidebar({ role, userName, needsActionCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const nav =
    role === 'ADMIN' ? adminNav : role === 'CLIENT' ? clientNav : subcontractorNav

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-2 shadow"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        <span className="block w-5 h-0.5 bg-[#111827] dark:bg-[#F1F5F9] mb-1" />
        <span className="block w-5 h-0.5 bg-[#111827] dark:bg-[#F1F5F9] mb-1" />
        <span className="block w-5 h-0.5 bg-[#111827] dark:bg-[#F1F5F9]" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-56 bg-white dark:bg-[#1E293B] border-r border-[#E5E7EB] dark:border-[#334155] flex flex-col z-40 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#E5E7EB] dark:border-[#334155]">
          <span className="text-xl font-bold text-[#2563EB] dark:text-[#3B82F6] tracking-tight">
            Jobbly
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#EFF6FF] dark:bg-[#1e3a5f] text-[#2563EB] dark:text-[#3B82F6]'
                    : 'text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A]'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}

          {(role === 'ADMIN' || role === 'SUBCONTRACTOR') && (
            <Link
              href="/needs-action"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors mt-2 border-t border-[#E5E7EB] dark:border-[#334155] pt-4 ${
                pathname === '/needs-action'
                  ? 'bg-[#EFF6FF] dark:bg-[#1e3a5f] text-[#2563EB] dark:text-[#3B82F6]'
                  : 'text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A]'
              }`}
            >
              <span>⚡</span>
              <span className="flex-1">Needs Action</span>
              {needsActionCount > 0 && (
                <span className="min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                  {needsActionCount > 99 ? '99+' : needsActionCount}
                </span>
              )}
            </Link>
          )}

          {role === 'ADMIN' && (
            <Link
              href="/campaigns"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A]"
            >
              <span>🔀</span> Switch Campaign
            </Link>
          )}
        </nav>

        {/* User + logout */}
        <div className="px-4 py-4 border-t border-[#E5E7EB] dark:border-[#334155]">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-sm font-medium text-[#111827] dark:text-[#F1F5F9] hover:text-[#2563EB] dark:hover:text-[#3B82F6] transition-colors truncate"
          >
            👤 {userName}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-2 text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#DC2626] transition-colors"
          >
            🚪 Log out
          </button>
        </div>
      </aside>
    </>
  )
}
