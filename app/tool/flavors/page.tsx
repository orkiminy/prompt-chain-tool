'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase-browser'
import Link from 'next/link'

type HumorFlavor = {
  id: number
  name: string
  description?: string
  [key: string]: any
}

export default function FlavorsPage() {
  const supabase = createClient()
  const [flavors, setFlavors] = useState<HumorFlavor[]>([])
  const [stepCounts, setStepCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [showAdd, setShowAdd] = useState(false)
  const [editFlavor, setEditFlavor] = useState<HumorFlavor | null>(null)
  const [deleteFlavor, setDeleteFlavor] = useState<HumorFlavor | null>(null)

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function fetchFlavors() {
    setLoading(true)
    const [{ data }, { count }] = await Promise.all([
      supabase.from('humor_flavors').select('*').order('id'),
      supabase.from('humor_flavors').select('*', { count: 'exact', head: true }),
    ])
    setTotalCount(count ?? 0)
    const list = data || []
    setFlavors(list)

    if (list.length > 0) {
      const ids = list.map(f => f.id)
      const { data: steps } = await supabase
        .from('humor_flavor_steps')
        .select('humor_flavor_id')
        .in('humor_flavor_id', ids)
      const counts: Record<number, number> = {}
      for (const s of steps || []) {
        counts[s.humor_flavor_id] = (counts[s.humor_flavor_id] || 0) + 1
      }
      setStepCounts(counts)
    }
    setLoading(false)
  }

  useEffect(() => { fetchFlavors() }, [])

  function openAdd() {
    setFormName(''); setFormDesc(''); setShowAdd(true)
  }

  function openEdit(f: HumorFlavor) {
    setFormName(f.name || ''); setFormDesc(f.description || ''); setEditFlavor(f)
  }

  async function handleCreate() {
    if (!formName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('humor_flavors').insert({
      name: formName.trim(),
      description: formDesc.trim() || null,
    })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowAdd(false)
    await fetchFlavors()
  }

  async function handleUpdate() {
    if (!editFlavor || !formName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('humor_flavors').update({
      name: formName.trim(),
      description: formDesc.trim() || null,
    }).eq('id', editFlavor.id)
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setEditFlavor(null)
    await fetchFlavors()
  }

  async function handleDelete() {
    if (!deleteFlavor) return
    setDeleting(true)
    // Delete steps first, then the flavor
    await supabase.from('humor_flavor_steps').delete().eq('humor_flavor_id', deleteFlavor.id)
    const { error } = await supabase.from('humor_flavors').delete().eq('id', deleteFlavor.id)
    setDeleting(false)
    if (error) { alert('Error: ' + error.message); return }
    setDeleteFlavor(null)
    await fetchFlavors()
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Humor Flavors</h1>
        <button onClick={openAdd} className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors text-sm">
          + New Flavor
        </button>
      </div>
      <p className="text-gray-400 mb-8">{totalCount} flavor{totalCount !== 1 ? 's' : ''}</p>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          {flavors.length === 0 ? (
            <p className="px-6 py-12 text-gray-400 text-center text-sm">No humor flavors yet. Create one to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400">ID</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400">Description</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Steps</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {flavors.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-5 py-3 text-gray-400 text-xs">{f.id}</td>
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-white">
                      <Link href={`/tool/flavors/${f.id}`} className="hover:text-orange-500 transition-colors">
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 max-w-xs">
                      <p className="line-clamp-2 text-xs">{f.description || <span className="italic">No description</span>}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {stepCounts[f.id] ?? 0} steps
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-center">
                        <Link href={`/tool/flavors/${f.id}`} className="text-xs px-3 py-1.5 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                          Open
                        </Link>
                        <button onClick={() => openEdit(f)} className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setDeleteFlavor(f)} className="text-xs px-3 py-1.5 border border-red-100 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(showAdd || editFlavor) && (
        <Modal title={showAdd ? 'New Humor Flavor' : 'Edit Flavor'} onClose={() => { setShowAdd(false); setEditFlavor(null) }}>
          <div className="space-y-4">
            <Field label="Name *">
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Deadpan Sarcasm"
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </Field>
            <Field label="Description">
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder="Describe what makes this humor flavor unique..."
                rows={4}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowAdd(false); setEditFlavor(null) }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={showAdd ? handleCreate : handleUpdate}
                disabled={saving || !formName.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {saving ? 'Saving...' : showAdd ? 'Create Flavor' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteFlavor && (
        <Modal title="Delete Flavor" onClose={() => setDeleteFlavor(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
              Delete <strong>"{deleteFlavor.name}"</strong>? This will also delete all {stepCounts[deleteFlavor.id] ?? 0} steps. This cannot be undone.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteFlavor(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  )
}
