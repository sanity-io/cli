import {realpathSync} from 'node:fs'

/**
 * Resolve a directory to its canonical (long) form before handing it to
 * `fs.watch`.
 *
 * On Windows, `fs.watch` aborts with a libuv assertion
 * (`!_wcsnicmp(filename, dir, dirlen)` in `fs-event.c`) when the watched path
 * is an 8.3 short name — e.g. temp dirs under `RUNNER~1` — because the OS
 * reports long-form filenames that fail libuv's prefix check.
 * `realpathSync.native` expands short names to their long form so the
 * prefixes match.
 *
 * Falls back to the original path when it can't be resolved (e.g. it doesn't
 * exist yet), which is no worse than watching it directly.
 */
export function canonicalizeWatchDir(dir: string): string {
  try {
    return realpathSync.native(dir)
  } catch {
    return dir
  }
}
