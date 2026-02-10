/**
 * Race a promise against a timeout, with proper cleanup of the timeout timer
 *
 * @param promise - The promise to race
 * @param timeout - Timeout in milliseconds
 * @returns The promise result, or null if timeout wins
 */
export async function promiseRaceWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
): Promise<T | null> {
  let timeoutId: NodeJS.Timeout | undefined

  try {
    const result = await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeout)
      }),
    ])

    // Clear timeout if promise won
    if (timeoutId && result !== null) {
      clearTimeout(timeoutId)
    }

    return result
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
