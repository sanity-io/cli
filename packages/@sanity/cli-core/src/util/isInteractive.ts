export function isInteractive({
  skipCi = false,
}: {
  /**
   * IF true, skip checking the CI environment variable
   */
  skipCi?: boolean
} = {}): boolean {
  return (
    Boolean(process.stdin.isTTY) &&
    process.env.TERM !== 'dumb' &&
    (skipCi || !('CI' in process.env))
  )
}
