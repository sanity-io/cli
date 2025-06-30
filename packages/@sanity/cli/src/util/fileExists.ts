import {access} from 'node:fs/promises'

/**
 * Checks if a file exists and can be "accessed".
 * Prone to race conditions, but good enough for our use cases.
 *
 * @param filePath - The path to the file to check
 * @returns A promise that resolves to true if the file exists, false otherwise
 * @internal
 */
export function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  )
}
