import { createClient } from '@/utils/supabase-server'
import Link from 'next/link'

export default async function ToolOverviewPage() {
  const supabase = await createClient()

  const [
    { count: flavorCount },
    { count: stepCount },
    { count: imageCount },
    { count: captionCount },
  ] = await Promise.all([
    supabase.from('humor_flavors').select('*', { count: 'exact', head: true }),
    supabase.from('humor_flavor_steps').select('*', { count: 'exact', head: true }),
    supabase.from('images').select('*', { count: 'exact', head: true }),
    supabase.from('captions').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Humor Flavors', value: flavorCount ?? 0, href: '/tool/flavors', color: 'text-orange-500' },
    { label: 'Flavor Steps', value: stepCount ?? 0, href: '/tool/flavors', color: 'text-blue-500' },
    { label: 'Images', value: imageCount ?? 0, href: '/tool/images', color: 'text-green-500' },
    { label: 'Captions', value: captionCount ?? 0, href: '/tool/flavors', color: 'text-purple-500' },
  ]

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Overview</h1>
      <p className="text-gray-400 mb-8">Prompt chain tool for managing humor flavors</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/tool/flavors" className="bg-orange-500 text-white rounded-2xl p-6 hover:bg-orange-600 transition-colors">
          <p className="text-xl font-bold mb-1">Manage Flavors</p>
          <p className="text-orange-100 text-sm">Create, edit, and test humor flavors and their prompt steps</p>
        </Link>
        <Link href="/tool/images" className="bg-gray-800 text-white rounded-2xl p-6 hover:bg-gray-700 transition-colors">
          <p className="text-xl font-bold mb-1">Manage Images</p>
          <p className="text-gray-300 text-sm">Upload and manage images for testing your prompt chains</p>
        </Link>
      </div>
    </div>
  )
}
