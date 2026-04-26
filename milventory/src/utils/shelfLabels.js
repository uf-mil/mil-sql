/**
 * Shelf helpers.
 *
 * The DB column `locations.shelf_count` is the single source of truth for
 * whether a location has shelves and how many. Shelf indices are 0-based and
 * oriented top-to-bottom (index 0 = top-most shelf).
 *
 * User-facing labels number shelves 1..N top-to-bottom:
 *   - `"Shelf 1 (top)"` for index 0 (when shelfCount > 1)
 *   - `"Shelf N (bottom)"` for index N-1 (when shelfCount > 1)
 *   - `"Shelf K"` otherwise
 *   - A lone shelf (shelfCount === 1) is just `"Shelf 1"`.
 */

/** Normalized shelf count for a box, treating missing/null as 0. */
export function getShelfCount(box) {
  if (!box) return 0;
  const n = box.shelf_count;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/** True iff the box has one or more shelves. */
export function hasShelves(box) {
  return getShelfCount(box) > 0;
}

/**
 * Label for a single 0-based shelf index, given the total shelf count at that
 * location. Falls back to `"Shelf {idx+1}"` if shelfCount is unknown/invalid.
 */
export function getShelfLabel(shelfIdx, shelfCount) {
  const idx = Math.max(0, Math.trunc(shelfIdx || 0));
  const n = Math.max(0, Math.trunc(shelfCount || 0));
  if (n <= 0) return `Shelf ${idx + 1}`;
  if (n === 1) return 'Shelf 1';
  if (idx === 0) return 'Shelf 1 (top)';
  if (idx === n - 1) return `Shelf ${n} (bottom)`;
  return `Shelf ${idx + 1}`;
}

/**
 * Array of shelf labels, ordered top-to-bottom (index 0 = top shelf).
 * Returns an empty array when shelfCount <= 0.
 */
export function getShelfLabels(shelfCount) {
  const n = Math.max(0, Math.trunc(shelfCount || 0));
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(getShelfLabel(i, n));
  return out;
}
