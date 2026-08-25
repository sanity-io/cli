/**
 * Sorts pre-stringified table rows by a single column, ascending.
 *
 * Values are compared as strings, so a numeric column orders lexicographically
 * (`10` before `9`) — kept deliberately, since that is how these listings have
 * always ordered. `Array.prototype.toSorted` is a stable sort, so rows that tie
 * on the column keep their original order. An out-of-range column leaves the
 * rows in their original order.
 *
 * @param rows - The rows to sort
 * @param column - Index of the column to sort by
 * @returns A new, sorted array
 * @internal
 */
export function sortRowsByColumn<Row extends readonly string[]>(
  rows: Row[],
  column: number,
): Row[] {
  return rows.toSorted((a, b) => {
    const left = a[column]
    const right = b[column]
    if (left === right) return 0
    return left < right ? -1 : 1
  })
}
