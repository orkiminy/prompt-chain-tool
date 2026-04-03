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

type LookupRow = { id: number; name?: string; slug?: string }

const FALLBACK_INPUT_TYPES: LookupRow[] = [
  { id: 1, slug: 'image-and-text' },
  { id: 2, slug: 'text-only' },
]
const FALLBACK_OUTPUT_TYPES: LookupRow[] = [
  { id: 1, slug: 'string' },
  { id: 2, slug: 'array' },
]
const FALLBACK_STEP_TYPES: LookupRow[] = [
  { id: 1, slug: 'celebrity-recognition' },
  { id: 2, slug: 'image-description' },
  { id: 3, slug: 'general' },
]
const FALLBACK_LLM_MODELS: LookupRow[] = [
  { id: 1,  name: 'GPT-4.1' },
  { id: 2,  name: 'GPT-4.1 mini' },
  { id: 3,  name: 'GPT-4.1 nano' },
  { id: 4,  name: 'GPT-4.5' },
  { id: 5,  name: 'GPT-4o' },
  { id: 6,  name: 'GPT-4o mini' },
  { id: 7,  name: 'o1' },
  { id: 8,  name: 'o3' },
  { id: 9,  name: 'o3 mini' },
  { id: 10, name: 'o4 mini' },
  { id: 11, name: 'Claude 3.5 Sonnet' },
  { id: 12, name: 'Claude 3.7 Sonnet' },
  { id: 13, name: 'Gemini 2.5 Pro' },
  { id: 14, name: 'Gemini 2.5 Flash' },
  { id: 15, name: 'Gemini 2.0 Flash' },
  { id: 16, name: 'Gemini 2.0 Flash Lite' },
  { id: 17, name: 'Gemini 1.5 Pro' },
  { id: 18, name: 'Gemini 1.5 Flash' },
  { id: 19, name: 'Gemini 1.5 Flash 8B' },
]

// Display label for a lookup row (some tables use 'name', others use 'slug')
function lookupLabel(row: LookupRow): string {
  return row.name || row.slug || String(row.id)
}

// Preferred display order for step form fields
const STEP_COL_ORDER = [
  'llm_temperature',
  'llm_input_type_id',
  'llm_output_type_id',
  'llm_model_id',
  'humor_flavor_step_type_id',
  'llm_system_prompt',
  'llm_user_prompt',
  'description',
]

const DEFAULT_STEP_COLS = STEP_COL_ORDER

function sortStepCols(cols: string[]): string[] {
  return [...cols].sort((a, b) => {
    const ai = STEP_COL_ORDER.indexOf(a)
    const bi = STEP_COL_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

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
  const [inputTypes, setInputTypes] = useState<LookupRow[]>(FALLBACK_INPUT_TYPES)
  const [outputTypes, setOutputTypes] = useState<LookupRow[]>(FALLBACK_OUTPUT_TYPES)
  const [llmModels, setLlmModels] = useState<LookupRow[]>(FALLBACK_LLM_MODELS)
  const [stepTypes, setStepTypes] = useState<LookupRow[]>(FALLBACK_STEP_TYPES)

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
      setStepCols(sortStepCols(getEditableStepCols(Object.keys(list[0]))))
    }
  }

  async function fetchCaptions() {
    const { data } = await supabase.from('captions').select('id, content, image_id').eq('humor_flavor_id', flavorId).order('id', { ascending: false }).limit(100)
    setCaptions(data || [])
  }

  async function fetchImages() {
    const { data } = await supabase.from('images').select('id, url, image_description').order('id', { ascending: false }).limit(200)
    setImages(data || [])
  }

  async function fetchLookups() {
    const [{ data: it }, { data: ot }, { data: lm }, { data: st }] = await Promise.all([
      supabase.from('llm_input_types').select('id, slug').order('id'),
      supabase.from('llm_output_types').select('id, slug').order('id'),
      supabase.from('llm_models').select('id, name').order('id'),
      supabase.from('humor_flavor_step_types').select('id, slug').order('id'),
    ])
    if (it && it.length > 0) setInputTypes(it)
    if (ot && ot.length > 0) setOutputTypes(ot)
    if (lm && lm.length > 0) setLlmModels(lm)
    if (st && st.length > 0) setStepTypes(st)
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
    const fkDefaults: Record<string, LookupRow[]> = {
      llm_input_type_id: inputTypes,
      llm_output_type_id: outputTypes,
      llm_model_id: llmModels,
      humor_flavor_step_type_id: stepTypes,
    }
    cols.forEach(c => {
      const opts = fkDefaults[c]
      emptyForm[c] = opts && opts.length > 0 ? String(opts[0].id) : ''
    })
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
    for (const col of FK_COLS) {
      if (stepCols.includes(col) && !stepForm[col]) {
        alert(`Please select a value for "${col.replace(/_id$/, '').replace(/_/g, ' ')}"`)
        return
      }
    }
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

  // Lookup maps for displaying FK values
  const lookupMap: Record<string, LookupRow[]> = {
    llm_input_type_id: inputTypes,
    llm_output_type_id: outputTypes,
    llm_model_id: llmModels,
    humor_flavor_step_type_id: stepTypes,
  }

  function fkDisplayValue(col: string, val: any): string {
    const rows = lookupMap[col]
    if (!rows) return String(val ?? '')
    const match = rows.find(r => r.id === Number(val))
    return match ? lookupLabel(match) : String(val ?? '')
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/tool/flavors" className="text-sm text-gray-400 hover:text-orange-500 mb-2 inline-block">&larr; All Flavors</Link>
        {editingFlavor ? (
          <div className="space-y-3">
            <input type="text" value={flavorName} onChange={e => setFlavorName(e.target.value)}
              className="text-2xl font-bold w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
            <textarea value={flavorDesc} onChange={e => setFlavorDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleSaveFlavor} disabled={savingFlavor || !flavorName.trim()}
                className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {savingFlavor ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditingFlavor(false); setFlavorName(flavor.slug || ''); setFlavorDesc(flavor.description || '') }}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{flavor.slug}</h1>
              <p className="text-gray-400 mt-1 text-sm">{flavor.description || 'No description'}</p>
            </div>
            <button onClick={() => setEditingFlavor(true)}
              className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
        {(['steps', 'captions', 'test'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${activeTab === tab
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
            {tab} {tab === 'steps' ? `(${steps.length})` : tab === 'captions' ? `(${captions.length})` : ''}
          </button>
        ))}
      </div>

      {/* Steps Tab */}
      {activeTab === 'steps' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={openAddStep}
              className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600">
              + Add Step
            </button>
          </div>
          {steps.length === 0 ? (
            <p className="text-gray-400 text-center py-12 text-sm">No steps yet. Add one to build your prompt chain.</p>
          ) : (
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={s.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold">{s.order_by}</span>
                        <span className="text-xs text-gray-400">{fkDisplayValue('humor_flavor_step_type_id', s.humor_flavor_step_type_id)}</span>
                        <span className="text-xs text-gray-400">| {fkDisplayValue('llm_model_id', s.llm_model_id)}</span>
                        {s.llm_temperature != null && <span className="text-xs text-gray-400">| temp: {s.llm_temperature}</span>}
                      </div>
                      {s.description && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{s.description}</p>}
                      {s.llm_system_prompt && (
                        <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 max-h-32 overflow-auto mb-1">{s.llm_system_prompt}</pre>
                      )}
                      {s.llm_user_prompt && (
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-xl p-2 max-h-20 overflow-auto">{s.llm_user_prompt}</pre>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 ml-4">
                      <button onClick={() => moveStep(s, 'up')} disabled={i === 0 || reordering}
                        className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-30">↑</button>
                      <button onClick={() => moveStep(s, 'down')} disabled={i === steps.length - 1 || reordering}
                        className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-30">↓</button>
                      <button onClick={() => openEditStep(s)}
                        className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Edit</button>
                      <button onClick={() => setDeleteStep(s)}
                        className="text-xs px-2 py-1 border border-red-100 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">Del</button>
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
          {captions.length === 0 ? (
            <p className="text-gray-400 text-center py-12 text-sm">No captions generated yet for this flavor.</p>
          ) : (
            <div className="space-y-2">
              {captions.map(c => (
                <div key={c.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {c.content}
                  {c.image_id && <span className="text-xs text-gray-400 ml-2">Image: {String(c.image_id).slice(0, 8)}...</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" placeholder="Search images..." value={imageSearch}
                onChange={e => setImageSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
              <button onClick={runTest} disabled={selectedImages.size === 0 || testing}
                className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap">
                {testing ? 'Running...' : `Run Test (${selectedImages.size})`}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-auto">
              {filteredImages.map(img => (
                <div key={img.id} onClick={() => toggleImage(img.id)}
                  className={`cursor-pointer rounded-xl overflow-hidden border-2 transition-colors ${selectedImages.has(img.id) ? 'border-orange-500' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  <img src={img.url} alt={img.image_description || ''} className="w-full h-24 object-cover" />
                  <p className="text-[10px] text-gray-400 p-1 truncate">{img.image_description || img.url.split('/').pop()}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            {testResults.length === 0 ? (
              <p className="text-gray-400 text-sm">Select images and click &quot;Run Test&quot; to generate captions using this flavor.</p>
            ) : (
              <div className="space-y-4">
                {testResults.map((r, i) => (
                  <div key={i} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <img src={r.image.url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <p className="text-xs text-gray-400 flex-1 truncate">{r.image.image_description || r.image.url.split('/').pop()}</p>
                    </div>
                    {r.error ? (
                      <p className="text-red-500 text-sm">{r.error}</p>
                    ) : (
                      <ul className="space-y-1">
                        {r.captions.map((c, j) => (
                          <li key={j} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                            {c.content}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Step Modal */}
      {(showAddStep || editStep) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">{showAddStep ? 'Add Step' : 'Edit Step'}</h3>
              <button onClick={() => { setShowAddStep(false); setEditStep(null) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {stepCols.map(col => {
                const isFK = FK_COLS.includes(col)
                const isLongText = col.includes('prompt') || col === 'description'
                const isNumber = col === 'llm_temperature'
                const options = isFK ? lookupMap[col] || [] : []

                return (
                  <div key={col}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {col.replace(/_/g, ' ')}
                    </label>
                    {isFK ? (
                      <select value={stepForm[col] || ''} onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                        <option value="">Select...</option>
                        {options.map(o => <option key={o.id} value={o.id}>{lookupLabel(o)}</option>)}
                      </select>
                    ) : isLongText ? (
                      <textarea value={stepForm[col] || ''} onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                        rows={col.includes('system') ? 8 : 4}
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none font-mono" />
                    ) : isNumber ? (
                      <input type="number" step="0.1" min="0" max="2" value={stepForm[col] || ''} onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    ) : (
                      <input type="text" value={stepForm[col] || ''} onChange={e => setStepForm(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    )}
                  </div>
                )
              })}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAddStep(false); setEditStep(null) }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancel
                </button>
                <button onClick={showAddStep ? handleCreateStep : handleUpdateStep}
                  disabled={savingStep}
                  className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                  {savingStep ? 'Saving...' : showAddStep ? 'Add Step' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Step Modal */}
      {deleteStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">Delete Step</h3>
              <button onClick={() => setDeleteStep(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
                Delete step #{deleteStep.order_by} ({deleteStep.description || 'No description'})? This cannot be undone.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteStep(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400">Cancel</button>
                <button onClick={handleDeleteStep} disabled={deletingStep}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                  {deletingStep ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
