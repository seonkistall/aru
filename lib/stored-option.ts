/**
 * Membership checks for a value restored from a device store.
 *
 * A value read back out of `sessionStorage` is not private to the code that wrote it.
 * An older build, a renamed category or an edited tab can leave a string there that is
 * no longer one of the options the screen renders, and the restore paths on `/survey`
 * and `/checkin` copied such a value straight into state on a truthiness or `typeof`
 * check alone. The result is invisible rather than loud: no chip reads as pressed,
 * because nothing in the rendered list equals the value — yet `/survey`'s `ready` test
 * counts the field as answered, so submit is enabled and the bad value is written
 * through to `/report`.
 *
 * `isSurvey` (`lib/recommend.ts`) does not catch this and is not meant to: it is a
 * structural guard, deliberately, because `/report` has to keep rendering a survey
 * whose category the catalogue no longer stocks rather than throwing on it. These two
 * helpers are the other half — the screen that OFFERS the options is the one that can
 * say which values are offerable, and it says so by passing its own option list in, so
 * there is no second copy of any list to drift.
 */

/** The value if it is one of `options`, else `null` (so a caller can leave state alone). */
export function storedOption<T>(options: readonly T[], value: unknown): T | null {
  return (options as readonly unknown[]).includes(value) ? (value as T) : null;
}

/**
 * The members of `value` that are in `options`, or `null` when `value` is not an array
 * at all. An empty array is a real answer — an optional chip group the visitor cleared —
 * so it comes back as `[]` and not as `null`.
 */
export function storedOptions<T>(options: readonly T[], value: unknown): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is T => (options as readonly unknown[]).includes(item));
}
