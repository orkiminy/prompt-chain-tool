'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase-browser'

type Image = {
  id: string
  url: string
  image_description: string | null
}

export default function ImagesPage() {
  const supabase = createClient()
  const [images, setImages] = useState<Image[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [editImage, setEditImage] = useState<Image | null>(null)
  const [deleteImage, setDeleteImage] = useState<Image | null>(null)

  const [formUrl, setFormUrl] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchImages() {
    setLoading(true)
    const [{ data }, { count }] = await Promise.all([
      supabase.from('images').select('id, url, image_description').order('id', { ascending: false }).limit(500),
      supabase.from('images').select('*', { count: 'exact', head: true }),
    ])
    setTotalCount(count ?? 0)
    setImages(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchImages() }, [])

  const openAdd = () => {
    setFormUrl(''); setFormDesc(''); setUploadStatus(null)
    setPendingFile(null); setPreviewUrl(null); setShowAdd(true)
  }

  function handleFileSelect(file: File) {
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setFormUrl('')
  }

  const openEdit = (img: Image) => { setFormUrl(img.url); setFormDesc(img.image_description || ''); setEditImage(img) }

  async function handleCreate() {
    if (!formUrl.trim() && !pendingFile) return
    setSaving(true)
    try {
      if (pendingFile) {
        const BASE_URL = 'https://api.almostcrackd.ai'
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('Not authenticated')

        setUploadStatus('Getting upload URL...')
        const presignRes = await fetch(`${BASE_URL}/pipeline/generate-presigned-url`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: pendingFile.type }),
        })
        if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`)
        const { presignedUrl, cdnUrl } = await presignRes.json()

        setUploadStatus('Uploading image...')
        const uploadRes = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': pendingFile.type },
          body: pendingFile,
        })
        if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`)

        setUploadStatus('Saving...')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        let profileId = user.id
        const { data: p2 } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle()
        if (p2) profileId = p2.id
        const { error: insertError } = await supabase.from('images').insert({
          url: cdnUrl,
          image_description: formDesc.trim() || null,
          profile_id: profileId,
          is_public: true,
          is_common_use: true,
        })
        if (insertError) throw new Error(insertError.message)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        let profileId = user.id
        const { data: p2 } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle()
        if (p2) profileId = p2.id
        const { error } = await supabase.from('images').insert({
          url: formUrl.trim(),
          image_description: formDesc.trim() || null,
          profile_id: profileId,
          is_public: true,
          is_common_use: true,
        })
        if (error) throw new Error(error.message)
      }
      setPendingFile(null); setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowAdd(false)
      await fetchImages()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false); setUploadStatus(null)
    }
  }

  async function handleUpdate() {
    if (!editImage || !formUrl.trim()) return
    setSaving(true)
    const { error } = await supabase.from('images').update({
      url: formUrl.trim(),
      image_description: formDesc.trim() || null,
    }).eq('id', editImage.id)
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setEditImage(null)
    await fetchImages()
  }

  async function handleDelete() {
    if (!deleteImage) return
    setDeleting(true)
    const { error } = await supabase.from('images').delete().eq('id', deleteImage.id)
    setDeleting(false)
    if (error) { alert('Error: ' + error.message); return }
    setDeleteImage(null)
    await fetchImages()
  }

  const filtered = images.filter(img =>
    !search ||
    img.url.toLowerCase().includes(search.toLowerCase()) ||
    (img.image_description || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Images</h1>
          <p className="text-gray-400 mt-1">{totalCount} total images</p>
        </div>
        <button onClick={openAdd} className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors text-sm">
          + Add Image
        </button>
      </div>

      <input type="text" placeholder="Search by URL or description..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm mb-6 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />

      {loading ? (
        <p className="text-gray-400">Loading images...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <p className="col-span-full text-gray-400 text-center py-16">No images found</p>
          ) : filtered.map(img => (
            <div key={img.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <img src={img.url} alt="" className="w-full aspect-video object-cover bg-gray-100 dark:bg-gray-800"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x225?text=No+Image' }} />
              <div className="p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 min-h-[2.5rem]">
                  {img.image_description || <span className="text-gray-400 italic">No description</span>}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openEdit(img)} className="flex-1 text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Edit</button>
                  <button onClick={() => setDeleteImage(img)} className="flex-1 text-xs px-3 py-1.5 border border-red-100 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Image" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={!!uploadStatus}
              className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors disabled:opacity-50">
              {uploadStatus ? `⏳ ${uploadStatus}` : '📁 Choose file from computer'}
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400">or paste a URL</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <Field label="Image URL">
              <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </Field>
            {(previewUrl || formUrl) && (
              <img src={previewUrl || formUrl} alt="" className="w-full aspect-video object-cover rounded-xl bg-gray-100 dark:bg-gray-800"
                onError={e => (e.currentTarget.style.display = 'none')} />
            )}
            {pendingFile && <p className="text-xs text-green-600 font-medium">✓ {pendingFile.name} selected</p>}
            <Field label="Description">
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional description..." rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleCreate} disabled={saving || (!formUrl.trim() && !pendingFile)}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {uploadStatus || (saving ? 'Saving...' : 'Add Image')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editImage && (
        <Modal title="Edit Image" onClose={() => setEditImage(null)}>
          <div className="space-y-4">
            <Field label="Image URL *">
              <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </Field>
            {formUrl && <img src={formUrl} alt="" className="w-full aspect-video object-cover rounded-xl bg-gray-100 dark:bg-gray-800" onError={e => (e.currentTarget.style.display = 'none')} />}
            <Field label="Description">
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditImage(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleUpdate} disabled={saving || !formUrl.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteImage && (
        <Modal title="Delete Image" onClose={() => setDeleteImage(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
              Delete this image? This cannot be undone.
            </div>
            <img src={deleteImage.url} alt="" className="w-full aspect-video object-cover rounded-xl bg-gray-100 dark:bg-gray-800" />
            <div className="flex gap-3">
              <button onClick={() => setDeleteImage(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
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
