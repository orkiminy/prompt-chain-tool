import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 mb-6">You need superadmin or matrix admin privileges to access this tool.</p>
        <Link href="/login" className="text-orange-400 hover:text-orange-300 text-sm underline">
          Back to Login
        </Link>
      </div>
    </div>
  )
}
