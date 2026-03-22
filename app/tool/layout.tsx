import { createClient } from '@/utils/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from './Sidebar'

export default async function ToolLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin, is_matrix_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_superadmin && !profile?.is_matrix_admin) redirect('/unauthorized')

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar email={user.email ?? ''} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
