'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/utils/supabase-browser'
import Link from 'next/link'
import {
  buildStepPayload,
  computeReorderSwap,
  filterImages,
  getEditableStepCols,
  getNextOrderBy,
  STEP_EXCLUDED,
  type Step,
  type Image,
} from '@/utils/flavor-logic'

type HumorFlavor = {
  id: number
  slug: string
  description?: string
  [key: string]: any
}

type Caption = {
  id: string
  content: string
  image_id?: string
}

type TestResult = {
  image: Image
  captions: Caption[]
  error?: string
}

type LookupRow = { id: number; name: string }

// Known FK columns that need dropdowns — used as fallback when no steps exist yet
const DEFAULT_STEP_COLS = [
  'humor_flavor_step_type_id',
  'llm_input_type_id',
  'llm_output_type_id',
  'llm_model_id',
  'llm_temperature',
  'llm_system_prompt',
  'llm_user_prompt',
  'description',
]

const FK_COLS = ['llm_input_type_id', 'llm_output_type_id', 'llm_model_id', 'humor_flavor_step_type_id']

export default function FlavorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const flavorId = Number(id)
  const supabase = createClient()

  const [flavor, setFlavor] = useState<HumorFlavor | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [captions, setCaptions] = useState<Caption[]>([])
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'steps' | 'captions' | 'test'>('steps')

  // Lookup tables for FK dropdowns
  const [inputTypes, setInputTypes] = useState<LookupRow[]>([])
  const [outputTypes, setOutputTypes] = useState<LookupRow[]>([])
  const [llmModels, setLlmModels] = useState<LookupRow[]>([])
  const [stepTypes, setStepTypes] = useState<LookupRow[]>([])

  // Edit flavor inline
  const [editingFlavor, setEditingFlavor] = useState(false)
  const [flavorName, setFlavorName] = useState('')
  const [flavorDesc, setFlavorDesc] = useState('')
  const [savingFlavor, setSavingFlavor] = useState(false)

  // Step modals
  const [showAddStep, setShowAddStep] = useState(false)
  const [editStep, setEditStep] = useState<Step | null>(null)
  const [deleteStep, setDeleteStep] = useState<Step | null>(null)
  const [stepForm, setStepForm] = useState<Record<string, string>>({})
  const [stepCols, setStepCols] = useState<string[]>([])
  const [savingStep, setSavingStep] = useState(false)
  const [deletingStep, setDeletingStep] = useState(false)
  const [reordering, setReordering] = useState(false)

  // Test tab
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [imageSearch, setImageSearch] = useState('')
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testing, setTesting] = useState(false)

  async function fetchFlavor() {
    const { data } = await supabase.from('humor_flavors').select('*').eq('id', flavorId).maybeSingle()
    if (data) {
      setFlavor(data)
      setFlavorName(data.slug || '')
      setFlavorDesc(data.description || '')
    }
  }

  async function fetchSteps() {
    const { data } = await supabase.from('humor_flavor_steps').select('*').eq('humor_flavor_id', flavorId).order('order_by')
    const list = data || []
    setSteps(list)
    if (list.length > 0) {
      setStepCols(getEditableStepCols(Object.keys(list[0])))
    }
  }

  async function fetchCaptions() {
    const { data } = await supabase.from('captions').select('id, content, image_id').eq('humor_flavor_id', flavorId).order('created_at', { ascending: false }).limit(100)
    setCaptions(data || [])
  }

  async function fetchImages() {
    const { data } = await supabase.from('images').select('id, url, image_description').order('created_datetime_utc', { ascending: false, nullsFirst: false }).limit(100)
    setImages(data || [])
  }

  async function fetchLookups() {
    const [{ data: it }, { data: ot }, { data: lm }, { data: st }] = await Promise.all([
      supabase.from('llm_input_types').select('id, name').order('id'),
      supabase.from('llm_output_types').select('id, name').order('id'),
      supabase.from('llm_models').select('id, name').order('id'),
      supabase.from('humor_flavor_step_types').select('id, name').order('id'),
    ])
    setInputTypes(it || [])
    setOutputTypes(ot || [])
    setLlmModels(lm || [])
    setStepTypes(st || [])
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([fetchFlavor(), fetchSteps(), fetchImages(), fetchLookups()])
      setLoading(false)
    }
    init()
  }, [flavorId])

  useEffect(() => {
    if (activeTab === 'captions') fetchCaptions()
  }, [activeTab])

  async function handleSaveFlavor() {
    if (!flavorName.trim()) return
    setSavingFlavor(true)
    const { error } = await supabase.from('humor_flavors').update({
      slug: flavorName.trim(),
      description: flavorDesc.trim() || null,
      modified_datetime_utc: new Date().toISOString(),
    }).eq('id', flavorId)
    setSavingFlavor(false)
    if (error) { alert('Error: ' + error.message); return }
    setEditingFlavor(false)
    await fetchFlavor()
  }

  // Step reordering
  async function moveStep(step: Step, direction: 'up' | 'down') {
    const swap = computeReorderSwap(steps, step.id, direction)
    if (!swap) return
    setReordering(true)
    await supabase.from('humor_flavor_steps').update({ order_by: swap[0].order_by }).eq('id', swap[0].id)
    await supabase.from('humor_flavor_steps').update({ order_by: swap[1].order_by }).eq('id', swap[1].id)
    await fetchSteps()
    setReordering(false)
  }

  function openAddStep() {
    const cols = stepCols.length > 0 ? stepCols : DEFAULT_STEP_COLS
    if (stepCols.length === 0) setStepCols(DEFAULT_STEP_COLS)
    const emptyForm: Record<string, string> = {}
    cols.forEach(c => { emptyForm[c] = '' })
    setStepForm(emptyForm)
    setShowAddStep(true)
  }

  function openEditStep(s: Step) {
    const form: Record<string, string> = {}
    stepCols.forEach(c => { form[c] = s[c] != null ? String(s[c]) : '' })
    setStepForm(form)
    setEditStep(s)
  }

  async function handleCreateStep() {
    setSavingStep(true)
    const formFields: Record<string, string> = {}
    stepCols.forEach(c => { formFields[c] = stepForm[c] ?? '' })
    const payload = {
      humor_flavor_id: flavorId,
      order_by: getNextOrderBy(steps),
      ...buildStepPayload(formFields),
    }
    const { error } = await supabase.from('humor_flavor_steps').insert(payload)
    setSavingStep(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowAddStep(false)
    await fetchSteps()
  }

  async function handleUpdateStep() {
    if (!editStep) return
    setSavingStep(true)
    const formFields: Record<string, string> = {}
    stepCols.forEach(c => { formFields[c] = stepForm[c] ?? '' })
    const payload = buildStepPayload(formFields)
    const { error } = await supabase.from('humor_flavor_steps').update(payload).eq('id', editStep.id)
    setSavingStep(false)
    if (error) { alert('Error: ' + error.message); return }
    setEditStep(null)
    await fetchSteps()
  }

  async function handleDeleteStep() {
    if (!deleteStep) return
    setDeletingStep(true)
    const { error } = await supabase.from('humor_flavor_steps').delete().eq('id', deleteStep.id)
    setDeletingStep(false)
    if (error) { alert('Error: ' + error.message); return }
    setDeleteStep(null)
    await fetchSteps()
  }

  function toggleImage(id: string) {
    setSelectedImages(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runTest() {
    if (selectedImages.size === 0) return
    setTesting(true)
    setTestResults([])

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { alert('Not authenticated'); setTesting(false); return }

    const selectedList = images.filter(img => selectedImages.has(img.id))
    const results: TestResult[] = []

    for (const img of selectedList) {
      try {
        const res = await fetch('https://api.almostcrackd.ai/pipeline/generate-captions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageId: img.id, humorFlavorId: flavorId }),
        })
        if (!res.ok) {
          const errText = await res.text()
          results.push({ image: img, captions: [], error: `API error (${res.status}): ${errText}` })
        } else {
          const data = await res.json()
          results.push({ image: img, captions: Array.isArray(data) ? data : [] })
        }
      } catch (e: any) {
        results.push({ image: img, captions: [], error: e.message })
      }
    }

    setTestResults(results)
    setTesting(false)
  }

  const filteredImages = filterImages(images, imageSearch)

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!flavor) return <div className="p-8 text-red-500">Flavor not found.</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/tool/flavors" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mt-1 text-lg">←</Link>
        <div className="flex-1">
          {editingFlavor ? (
            <div className="space-y-2">
              <input value={flavorName} onChange={e => setFlavorName(e.target.value)}
                className="text-2xl font-bold bg-transparent border-b-2 border-orange-400 focus:outline-none text-gray-900 dark:text-white w-full" />
              <textarea value={flavorDesc} onChange={e => setFlavorDesc(e.target.value)} rows={2}
                placeholder="Description..."
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setEditingFlavor(false)} className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={handleSaveFlavor} disabled={savingFlavor || !flavorName.trim()}
                  className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                  {savingFlavor ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{flavor.slug}</h1>
                <button onClick={() => setEditingFlavor(true)} className="text-xs px-2.5 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Edit
                </button>
              </div>
              {flavor.description && <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">{flavor.description}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
        {(['steps', 'captions', 'test'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tab === 'steps' ? `Steps (${steps.length})` : tab === 'captions' ? `Captions (${captions.length})` : 'Test'}
          </button>
        ))}
      </div>

      {/* Steps Tab */}
      {activeTab === 'steps' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{steps.length} step{steps.length !== 1 ? 's' : ''} in this chain</p>
            <button onClick={openAddStep} className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors">
              + Add Step
            </button>
          </div>

          {steps.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-12 text-center">
              <p className="text-gray-400 text-sm">No steps yet. Add your first step to build the prompt chain.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                      <button onClick={() => moveStep(step, 'up')} disabled={idx === 0 || reordering}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors">
                        ↑
                      </button>
                      <button onClick={() => moveStep(step, 'down')} disabled={idx === steps.length - 1 || reordering}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors">
                        ↓
                      </button>
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs text-gray-400">Step {step.order_by}</span>
                      </div>
                      <div className="space-y-1">
                        {stepCols.map(col => step[col] != null && String(step[col]).trim() !== '' && (
                          <div key={col}>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{col.replace(/_/g, ' ')}: </span>
                            <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{String(step[col])}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openEditStep(step)} className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => setDeleteStep(step)} className="text-xs px-3 py-1.5 border border-red-100 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Captions Tab */}
      {activeTab === 'captions' && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Captions generated using this flavor</p>
          {captions.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-12 text-center">
              <p className="text-gray-400 text-sm mb-2">No captions yet for this flavor.</p>
              <button onClick={() => setActiveTab('test')} className="text-orange-500 text-sm hover:underline">
                Go to Test tab to generate some →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {captions.map(c => (
                <div key={c.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-5 py-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{c.content}</p>
                  {c.image_id && <p className="text-xs text-gray-400 mt-1">Image: {c.image_id}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Image selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Select Test Images</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedImages(new Set(images.map(i => i.id)))}
                  className="text-xs text-orange-500 hover:underline">Select all</button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button onClick={() => setSelectedImages(new Set())}
                  className="text-xs text-gray-500 hover:underline">Clear</button>
              </div>
            </div>
            <input type="text" placeholder="Search images..." value={imageSearch} onChange={e => setImageSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300" />
            {selectedImages.size > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">{selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} selected</p>
            )}
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
              {filteredImages.map(img => (
                <button key={img.id} onClick={() => toggleImage(img.id)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-colors text-left ${
                    selectedImages.has(img.id)
                      ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}>
                  <img src={img.url} alt="" className="w-full aspect-square object-cover bg-gray-100 dark:bg-gray-800"
                    onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=No+Image' }} />
                  {selectedImages.has(img.id) && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
                  )}
                  {img.image_description && (
                    <p className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-1 line-clamp-1">{img.image_description}</p>
                  )}
                </button>
              ))}
              {filteredImages.length === 0 && (
                <p className="col-span-2 text-gray-400 text-sm text-center py-8">No images found. <Link href="/tool/images" className="text-orange-500 hover:underline">Add images →</Link></p>
              )}
            </div>
          </div>

          {/* Right: Results */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Results</p>
              <button onClick={runTest} disabled={selectedImages.size === 0 || testing}
                className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {testing ? 'Running...' : `Run Test (${selectedImages.size})`}
              </button>
            </div>

            {testResults.length === 0 && !testing && (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-12 text-center">
                <p className="text-gray-400 text-sm">Select images and click "Run Test" to generate captions using this flavor.</p>
              </div>
            )}

            {testing && (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm">Generating captions... this may take a moment.</p>
              </div>
            )}

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {testResults.map((result, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex gap-3 p-4">
                    <img src={result.image.url} alt="" className="w-16 h-16 object-cover rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/64x64?text=?' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 truncate">
                        {result.image.image_description || result.image.url}
                      </p>
                      {result.error ? (
                        <p className="text-xs text-red-500">{result.error}</p>
                      ) : result.captions.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No captions returned</p>
                      ) : (
                        <ul className="space-y-1">
                          {result.captions.map((c, j) => (
                            <li key={c.id || j} className="text-sm text-gray-700 dark:text-gray-300 before:content-['•'] before:mr-2 before:text-orange-400">
                              {c.content}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Step Modal */}
      {(showAddStep || editStep) && (
        <Modal title={showAddStep ? 'Add Step' : `Edit Step ${editStep?.order_by}`} onClose={() => { setShowAddStep(false); setEditStep(null) }}>
          <div className="space-y-4">
            {stepCols.map(col => {
              const inputClass = "w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
              const label = col.replace(/_id$/, '').replace(/_/g, ' ')

              // FK dropdown fields
              const lookupMap: Record<string, LookupRow[]> = {
                llm_input_type_id: inputTypes,
                llm_output_type_id: outputTypes,
                llm_model_id: llmModels,
                humor_flavor_step_type_id: stepTypes,
              }
              if (FK_COLS.includes(col)) {
                const opts = lookupMap[col] || []
                return (
                  <Field key={col} label={label}>
                    <select
                      value={stepForm[col] || ''}
                      onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                      className={inputClass}>
                      <option value="">— select —</option>
                      {opts.map(o => (
                        <option key={o.id} value={String(o.id)}>{o.name}</option>
                      ))}
                    </select>
                  </Field>
                )
              }

              // Temperature: number input
              if (col === 'llm_temperature') {
                return (
                  <Field key={col} label={label}>
                    <input
                      type="number"
                      min="0" max="2" step="0.1"
                      value={stepForm[col] || ''}
                      onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                      placeholder="0.0 – 2.0 (optional)"
                      className={inputClass}
                    />
                  </Field>
                )
              }

              // Large textareas for prompt fields
              const isLong = col.toLowerCase().includes('prompt') || col.toLowerCase().includes('instruction') || col.toLowerCase().includes('content')
              return (
                <Field key={col} label={label}>
                  <textarea
                    value={stepForm[col] || ''}
                    onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                    rows={isLong ? 6 : 2}
                    placeholder={`Enter ${label}...`}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              )
            })}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowAddStep(false); setEditStep(null) }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={showAddStep ? handleCreateStep : handleUpdateStep} disabled={savingStep}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {savingStep ? 'Saving...' : showAddStep ? 'Add Step' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Step Modal */}
      {deleteStep && (
        <Modal title="Delete Step" onClose={() => setDeleteStep(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
              Delete Step {deleteStep.order_by}? This cannot be undone.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteStep(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleDeleteStep} disabled={deletingStep} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                {deletingStep ? 'Deleting...' : 'Delete'}
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mb-1">{label}</label>
      {children}
    </div>
  )
}
