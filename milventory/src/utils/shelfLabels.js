/**
 * Shelf helpers.
 *
 * The DB column `locations.shelf_count` is the single source of truth for
 * whether a location has shelves and how many. Shelf indices are 0-based and
 * oriented bottom-to-top (index 0 = bottom-most shelf).
 *
 * User-facing labels number shelves 1..N bottom-to-top:
 *   - `"Shelf 1 (bottom)"` for index 0 (when shelfCount > 1)
 *   - `"Shelf N (top)"` for index N-1 (when shelfCount > 1)
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

/** Coerce API/UI shelf to a comparable integer or null (box-level / no shelf). */
export function normalizeShelfIndex(shelf) {
  if (shelf === undefined || shelf === null) return null;
  const n = Number(shelf);
  return Number.isFinite(n) ? n : null;
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
  if (idx === 0) return 'Shelf 1 (bottom)';
  if (idx === n - 1) return `Shelf ${n} (top)`;
  return `Shelf ${idx + 1}`;
}

/**
 * Return shelf indices in visual order (top row first, bottom row last).
 * Returns an empty array when shelfCount <= 0.
 */
export function getShelfIndicesTopToBottom(shelfCount) {
  const n = Math.max(0, Math.trunc(shelfCount || 0));
  const out = [];
  for (let row = 0; row < n; row += 1) out.push(n - 1 - row);
  return out;
}
