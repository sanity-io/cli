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
    // npm: `~/.npm/_npx/<hash>/...`
    normalized.includes('/_npx/') ||
    // pnpm: `~/Library/Caches/pnpm/dlx/<hash>/...` (or `~/.cache/pnpm/dlx/<hash>/...`)
    normalized.includes('/pnpm/dlx/') ||
    // yarn berry: `$TMPDIR/xfs-<hash>/dlx-<pid>/...`
    normalized.includes('/dlx-') ||
    // bun: `$TMPDIR/bunx-<uid>-<pkg>/...`
    normalized.includes('/bunx-')
  )
}
