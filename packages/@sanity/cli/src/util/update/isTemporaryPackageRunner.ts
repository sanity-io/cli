/**
 * Returns true when the given binary path looks like it was invoked from a
 * package runner's temporary download cache (npx, pnpm dlx, yarn dlx, bunx).
 *
 * These are throwaway installs where prompting the user to update is pointless:
 * the download is discarded right after the command completes, so the "update"
 * would be re-downloaded on the next invocation anyway.
 *
 * This does NOT match `npx sanity` / `pnpm exec sanity` when they resolve to a
 * locally installed binary, because those paths sit inside the project's
 * `node_modules/.bin/`.
 */
export function isTemporaryPackageRunner(binaryPath: string = process.argv[1] ?? ''): boolean {
  // Normalize Windows separators so a single set of patterns covers both platforms.
  const normalized = binaryPath.replaceAll('\\', '/')

  return (
    normalized.includes('/_npx/') || normalized.includes('/dlx-') || normalized.includes('/bunx-')
  )
}
