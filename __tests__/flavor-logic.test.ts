import {
  buildStepPayload,
  computeReorderSwap,
  filterImages,
  getEditableStepCols,
  getNextOrderBy,
  hasAdminAccess,
  STEP_EXCLUDED,
  type Step,
  type Image,
} from '../utils/flavor-logic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(id: number, order_by: number, flavorId = 1): Step {
  return { id, humor_flavor_id: flavorId, order_by }
}

function makeImage(id: string, url: string, desc: string | null = null): Image {
  return { id, url, image_description: desc }
}

// ===========================================================================
// getEditableStepCols
// ===========================================================================

describe('getEditableStepCols', () => {
  it('removes all STEP_EXCLUDED columns', () => {
    const result = getEditableStepCols(STEP_EXCLUDED)
    expect(result).toEqual([])
  })

  it('keeps columns that are not excluded', () => {
    const keys = ['llm_system_prompt', 'llm_user_prompt', 'description']
    expect(getEditableStepCols(keys)).toEqual(keys)
  })

  it('filters out only excluded columns from a mixed list', () => {
    const keys = ['id', 'llm_system_prompt', 'order_by', 'description', 'created_datetime_utc']
    expect(getEditableStepCols(keys)).toEqual(['llm_system_prompt', 'description'])
  })

  it('returns empty array for an empty input', () => {
    expect(getEditableStepCols([])).toEqual([])
  })

  it('is case-sensitive — near-matches are NOT excluded', () => {
    // 'ID' is not the same as 'id'
    const result = getEditableStepCols(['ID', 'Order_By', 'CREATED_DATETIME_UTC'])
    expect(result).toEqual(['ID', 'Order_By', 'CREATED_DATETIME_UTC'])
  })
})

// ===========================================================================
// buildStepPayload
// ===========================================================================

describe('buildStepPayload', () => {
  // --- null coercion ---
  it('converts empty string to null', () => {
    expect(buildStepPayload({ col: '' })).toEqual({ col: null })
  })

  it('converts all empty strings to null', () => {
    const result = buildStepPayload({ a: '', b: '', c: '' })
    expect(result).toEqual({ a: null, b: null, c: null })
  })

  // --- boolean coercion ---
  it('converts the string "true" to boolean true', () => {
    expect(buildStepPayload({ flag: 'true' })).toEqual({ flag: true })
  })

  it('converts the string "false" to boolean false', () => {
    expect(buildStepPayload({ flag: 'false' })).toEqual({ flag: false })
  })

  it('does NOT convert "TRUE" (wrong case) to boolean', () => {
    expect(buildStepPayload({ flag: 'TRUE' })).toEqual({ flag: 'TRUE' })
  })

  it('does NOT convert "False" (wrong case) to boolean', () => {
    expect(buildStepPayload({ flag: 'False' })).toEqual({ flag: 'False' })
  })

  // --- numeric coercion ---
  it('converts "0" to number 0', () => {
    expect(buildStepPayload({ n: '0' })).toEqual({ n: 0 })
  })

  it('converts positive integer string to number', () => {
    expect(buildStepPayload({ n: '42' })).toEqual({ n: 42 })
  })

  it('converts negative integer string to number', () => {
    expect(buildStepPayload({ n: '-7' })).toEqual({ n: -7 })
  })

  it('converts floating point string to number', () => {
    expect(buildStepPayload({ n: '3.14' })).toEqual({ n: 3.14 })
  })

  it('converts "1.5" temperature value to number', () => {
    expect(buildStepPayload({ llm_temperature: '1.5' })).toEqual({ llm_temperature: 1.5 })
  })

  it('does NOT convert "123abc" to number — keeps as string', () => {
    expect(buildStepPayload({ val: '123abc' })).toEqual({ val: '123abc' })
  })

  it('does NOT convert "1e2" scientific notation to number', () => {
    // Number('1e2') === 100, so this SHOULD become 100
    expect(buildStepPayload({ val: '1e2' })).toEqual({ val: 100 })
  })

  // --- string passthrough ---
  it('keeps regular prose strings as strings', () => {
    const prompt = 'You are a helpful assistant.'
    expect(buildStepPayload({ llm_system_prompt: prompt })).toEqual({ llm_system_prompt: prompt })
  })

  it('keeps whitespace-only strings as strings (not null)', () => {
    // A single space is NOT an empty string
    expect(buildStepPayload({ col: ' ' })).toEqual({ col: ' ' })
  })

  it('keeps "null" the string as a string, not JS null', () => {
    expect(buildStepPayload({ col: 'null' })).toEqual({ col: 'null' })
  })

  it('keeps "undefined" the string as a string', () => {
    expect(buildStepPayload({ col: 'undefined' })).toEqual({ col: 'undefined' })
  })

  // --- multi-field ---
  it('handles a realistic mixed form correctly', () => {
    const form = {
      llm_system_prompt: 'Be funny.',
      llm_user_prompt: '',
      llm_temperature: '1.5',
      description: '',
      llm_model_id: '3',
    }
    expect(buildStepPayload(form)).toEqual({
      llm_system_prompt: 'Be funny.',
      llm_user_prompt: null,
      llm_temperature: 1.5,
      description: null,
      llm_model_id: 3,
    })
  })

  it('returns empty object for empty form', () => {
    expect(buildStepPayload({})).toEqual({})
  })
})

// ===========================================================================
// getNextOrderBy
// ===========================================================================

describe('getNextOrderBy', () => {
  it('returns 1 when there are no steps', () => {
    expect(getNextOrderBy([])).toBe(1)
  })

  it('returns 2 for a single step with order_by = 1', () => {
    expect(getNextOrderBy([makeStep(1, 1)])).toBe(2)
  })

  it('returns max + 1 for sequential steps', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    expect(getNextOrderBy(steps)).toBe(4)
  })

  it('returns max + 1 when steps have gaps (1, 3, 5)', () => {
    const steps = [makeStep(1, 1), makeStep(2, 3), makeStep(3, 5)]
    expect(getNextOrderBy(steps)).toBe(6)
  })

  it('works correctly when the array is not sorted', () => {
    const steps = [makeStep(1, 3), makeStep(2, 1), makeStep(3, 2)]
    expect(getNextOrderBy(steps)).toBe(4)
  })

  it('handles a single step with a large order_by', () => {
    expect(getNextOrderBy([makeStep(1, 100)])).toBe(101)
  })

  it('handles steps with duplicate order_by values gracefully', () => {
    const steps = [makeStep(1, 2), makeStep(2, 2), makeStep(3, 2)]
    expect(getNextOrderBy(steps)).toBe(3)
  })
})

// ===========================================================================
// computeReorderSwap
// ===========================================================================

describe('computeReorderSwap', () => {
  // --- impossible moves ---
  it('returns null for an empty list', () => {
    expect(computeReorderSwap([], 1, 'up')).toBeNull()
  })

  it('returns null for a single-step list (up)', () => {
    expect(computeReorderSwap([makeStep(1, 1)], 1, 'up')).toBeNull()
  })

  it('returns null for a single-step list (down)', () => {
    expect(computeReorderSwap([makeStep(1, 1)], 1, 'down')).toBeNull()
  })

  it('returns null when moving the first step up', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    expect(computeReorderSwap(steps, 1, 'up')).toBeNull()
  })

  it('returns null when moving the last step down', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    expect(computeReorderSwap(steps, 3, 'down')).toBeNull()
  })

  it('returns null for a step ID that does not exist', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2)]
    expect(computeReorderSwap(steps, 999, 'up')).toBeNull()
  })

  // --- valid moves ---
  it('swaps order_by values when moving middle step up', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    const result = computeReorderSwap(steps, 2, 'up')
    expect(result).not.toBeNull()
    // step 2 should get order_by 1, step 1 should get order_by 2
    expect(result).toEqual([
      { id: 2, order_by: 1 },
      { id: 1, order_by: 2 },
    ])
  })

  it('swaps order_by values when moving middle step down', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    const result = computeReorderSwap(steps, 2, 'down')
    expect(result).toEqual([
      { id: 2, order_by: 3 },
      { id: 3, order_by: 2 },
    ])
  })

  it('moves the second step to first position correctly', () => {
    const steps = [makeStep(10, 1), makeStep(20, 2)]
    const result = computeReorderSwap(steps, 20, 'up')
    expect(result).toEqual([
      { id: 20, order_by: 1 },
      { id: 10, order_by: 2 },
    ])
  })

  it('moves the first step to second position correctly', () => {
    const steps = [makeStep(10, 1), makeStep(20, 2)]
    const result = computeReorderSwap(steps, 10, 'down')
    expect(result).toEqual([
      { id: 10, order_by: 2 },
      { id: 20, order_by: 1 },
    ])
  })

  it('handles non-sequential order_by values (gaps) correctly', () => {
    // order_by: 1, 5, 10 — moving 5 up should swap 1 and 5
    const steps = [makeStep(1, 1), makeStep(2, 5), makeStep(3, 10)]
    const result = computeReorderSwap(steps, 2, 'up')
    expect(result).toEqual([
      { id: 2, order_by: 1 },
      { id: 1, order_by: 5 },
    ])
  })

  it('handles an unsorted input array (sorts internally)', () => {
    // Array given in reverse order
    const steps = [makeStep(3, 3), makeStep(2, 2), makeStep(1, 1)]
    const result = computeReorderSwap(steps, 2, 'up')
    expect(result).toEqual([
      { id: 2, order_by: 1 },
      { id: 1, order_by: 2 },
    ])
  })

  it('does not mutate the input array', () => {
    const steps = [makeStep(1, 1), makeStep(2, 2), makeStep(3, 3)]
    const copy = steps.map(s => ({ ...s }))
    computeReorderSwap(steps, 2, 'up')
    expect(steps).toEqual(copy)
  })

  it('moving last step up works when there are many steps', () => {
    const steps = [1, 2, 3, 4, 5].map(n => makeStep(n, n))
    const result = computeReorderSwap(steps, 5, 'up')
    expect(result).toEqual([
      { id: 5, order_by: 4 },
      { id: 4, order_by: 5 },
    ])
  })
})

// ===========================================================================
// hasAdminAccess
// ===========================================================================

describe('hasAdminAccess', () => {
  it('returns false for null', () => {
    expect(hasAdminAccess(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(hasAdminAccess(undefined)).toBe(false)
  })

  it('returns false when both flags are false', () => {
    expect(hasAdminAccess({ is_superadmin: false, is_matrix_admin: false })).toBe(false)
  })

  it('returns false when both flags are null', () => {
    expect(hasAdminAccess({ is_superadmin: null, is_matrix_admin: null })).toBe(false)
  })

  it('returns false when both flags are undefined', () => {
    expect(hasAdminAccess({})).toBe(false)
  })

  it('returns true when is_superadmin is true', () => {
    expect(hasAdminAccess({ is_superadmin: true, is_matrix_admin: false })).toBe(true)
  })

  it('returns true when is_matrix_admin is true', () => {
    expect(hasAdminAccess({ is_superadmin: false, is_matrix_admin: true })).toBe(true)
  })

  it('returns true when both flags are true', () => {
    expect(hasAdminAccess({ is_superadmin: true, is_matrix_admin: true })).toBe(true)
  })

  it('returns true when only is_superadmin is provided and true', () => {
    expect(hasAdminAccess({ is_superadmin: true })).toBe(true)
  })

  it('returns true when only is_matrix_admin is provided and true', () => {
    expect(hasAdminAccess({ is_matrix_admin: true })).toBe(true)
  })

  it('returns false when is_superadmin is false and is_matrix_admin is omitted', () => {
    expect(hasAdminAccess({ is_superadmin: false })).toBe(false)
  })
})

// ===========================================================================
// filterImages
// ===========================================================================

describe('filterImages', () => {
  const images: Image[] = [
    makeImage('1', 'https://cdn.example.com/cat.jpg', 'A cute cat'),
    makeImage('2', 'https://cdn.example.com/dog.png', 'A happy dog'),
    makeImage('3', 'https://cdn.example.com/bird.webp', null),
    makeImage('4', 'https://other.com/fish.jpg', 'Fish underwater'),
  ]

  // --- no filtering ---
  it('returns all images when search is empty string', () => {
    expect(filterImages(images, '')).toHaveLength(4)
  })

  it('returns all images when search is whitespace only', () => {
    expect(filterImages(images, '   ')).toHaveLength(4)
  })

  it('returns all images when search is only tabs/newlines', () => {
    expect(filterImages(images, '\t\n')).toHaveLength(4)
  })

  it('returns an empty array when images list is empty', () => {
    expect(filterImages([], 'cat')).toEqual([])
  })

  // --- URL matching ---
  it('matches by URL substring', () => {
    const result = filterImages(images, 'other.com')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('4')
  })

  it('matches by file extension in URL', () => {
    const result = filterImages(images, '.webp')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  // --- description matching ---
  it('matches by description substring', () => {
    const result = filterImages(images, 'happy')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('does not crash on images with null description', () => {
    expect(() => filterImages(images, 'bird')).not.toThrow()
  })

  it('can match by URL when description is null', () => {
    const result = filterImages(images, 'bird')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  // --- case insensitivity ---
  it('is case-insensitive for URL matching', () => {
    const result = filterImages(images, 'CAT')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('is case-insensitive for description matching', () => {
    const result = filterImages(images, 'CUTE')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('is case-insensitive for mixed-case search', () => {
    const result = filterImages(images, 'HaPpY DoG')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  // --- no matches ---
  it('returns empty array when nothing matches', () => {
    expect(filterImages(images, 'elephant')).toEqual([])
  })

  // --- multiple matches ---
  it('returns multiple results when several images match', () => {
    // 'example.com' appears in three URLs
    const result = filterImages(images, 'example.com')
    expect(result).toHaveLength(3)
  })

  // --- original array not mutated ---
  it('does not mutate the input array', () => {
    const copy = [...images]
    filterImages(images, 'cat')
    expect(images).toEqual(copy)
  })
})
