'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/utils/supabase-browser'
import { useEffect, useState } from 'react'

const navItems = [
  { href: '/tool', label: 'Overview', icon: '📊', exact: true },
  { href: '/tool/flavors', label: 'Humor Flavors', icon: '🎭' },
  { href: '/tool/images', label: 'Images', icon: '🖼️' },
]

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const themeIcon = !mounted ? '🖥️' : theme === 'dark' ? '☀️' : theme === 'light' ? '🌙' : '🖥️'
  const themeLabel = !mounted ? 'System' : theme === 'dark' ? 'Light' : theme === 'light' ? 'Dark' : 'System'

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col h-full flex-shrink-0 overflow-y-auto">
      <div className="px-5 py-5 border-b border-gray-800 flex-shrink-0">
        <p className="font-bold text-white">Prompt Chain Tool</p>
        <p className="text-xs text-gray-500 mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 px-3 py-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-3 mb-1">Navigation</p>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-gray-800 flex-shrink-0 space-y-1">
        <button
          onClick={cycleTheme}
          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>{themeIcon}</span>
          {themeLabel} mode
        </button>
        <p className="text-xs text-gray-500 px-3 mb-1 truncate">{email}</p>
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
