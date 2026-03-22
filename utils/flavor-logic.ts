// Pure business logic extracted from the flavor detail page.
// All functions here are side-effect-free and fully testable.

export type Step = {
  id: number
  humor_flavor_id: number
  order_by: number
  [key: string]: any
}

export type Image = {
  id: string
  url: string
  image_description: string | null
}

export type Profile = {
  is_superadmin?: boolean | null
  is_matrix_admin?: boolean | null
}

// Columns that are managed by the DB / system and should NOT appear in edit forms
export const STEP_EXCLUDED = [
  'id',
  'humor_flavor_id',
  'order_by',
  'created_datetime_utc',
  'modified_datetime_utc',
  'created_by_user_id',
  'modified_by_user_id',
]

/**
 * Returns the subset of step column names that users can edit.
 * Strips out system/FK/ordering columns.
 */
export function getEditableStepCols(allKeys: string[]): string[] {
  return allKeys.filter(k => !STEP_EXCLUDED.includes(k))
}

/**
 * Converts a flat string form (every value is a string) into a
 * DB-ready payload with proper types.
 *
 * Rules (in priority order):
 *   ''        → null
 *   'true'    → true   (case-sensitive)
 *   'false'   → false  (case-sensitive)
 *   numeric   → Number (including '0', '-1', '3.14')
 *   otherwise → string as-is
 */
export function buildStepPayload(form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [col, v] of Object.entries(form)) {
    if (v === '') {
      payload[col] = null
    } else if (v === 'true') {
      payload[col] = true
    } else if (v === 'false') {
      payload[col] = false
    } else if (v.trim() !== '' && !isNaN(Number(v))) {
      payload[col] = Number(v)
    } else {
      payload[col] = v
    }
  }
  return payload
}

/**
 * Returns the next order_by value for a new step appended to the end.
 * When the list is empty, starts at 1.
 * Uses the current maximum regardless of gaps.
 */
export function getNextOrderBy(steps: Step[]): number {
  if (steps.length === 0) return 1
  return Math.max(...steps.map(s => s.order_by)) + 1
}

/**
 * Computes the two DB updates needed to swap a step with its neighbour.
 *
 * Returns a tuple [ { id, order_by }, { id, order_by } ] describing
 * the NEW order_by values to write for each row, or null when the move
 * is impossible (step not found, already at boundary).
 *
 * The input array does NOT need to be pre-sorted.
 */
export function computeReorderSwap(
  steps: Step[],
  stepId: number,
  direction: 'up' | 'down'
): [{ id: number; order_by: number }, { id: number; order_by: number }] | null {
  if (steps.length < 2) return null

  const sorted = [...steps].sort((a, b) => a.order_by - b.order_by)
  const idx = sorted.findIndex(s => s.id === stepId)
  if (idx === -1) return null

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sorted.length) return null

  const step = sorted[idx]
  const other = sorted[swapIdx]

  return [
    { id: step.id,  order_by: other.order_by },
    { id: other.id, order_by: step.order_by  },
  ]
}

/**
 * Returns true when a profile has access to the admin tool.
 * Requires is_superadmin OR is_matrix_admin to be truthy.
 */
export function hasAdminAccess(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return !!profile.is_superadmin || !!profile.is_matrix_admin
}

/**
 * Client-side image search filter.
 * Matches case-insensitively against url and image_description.
 * A blank/whitespace-only search returns the full list unchanged.
 */
export function filterImages(images: Image[], search: string): Image[] {
  const q = search.trim().toLowerCase()
  if (!q) return images
  return images.filter(
    img =>
      img.url.toLowerCase().includes(q) ||
      (img.image_description ?? '').toLowerCase().includes(q)
  )
}
