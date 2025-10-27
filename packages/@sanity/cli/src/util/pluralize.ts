/**
 * Pluralizes a word based on a count
 * @param word - The word to pluralize
 * @param count - The count to determine singular or plural
 * @returns The word in singular or plural form
 * @internal
 */
export function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}
