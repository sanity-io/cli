import {watch} from 'node:fs'

import {canonicalizeWatchDir} from './canonicalizeWatchDir.js'

/**
 * Debounce window between config file events and the next run. Coalesces rapid
 * saves (e.g. editor auto-save) and atomic-rename bursts emitted by tools like
 * VS Code.
 */
const DEBOUNCE_MS = 250

interface ConfigFileWatcher {
  /** Stop watching and drop any queued run. Idempotent. */
  close: () => void
  /** Run now, coalesced with config file events like any other change. */
  run: () => void
}

interface WatchConfigFilesOptions {
  dir: string
  filenames: Iterable<string>
  onChange: () => Promise<void>
  /** Receives `fs.watch` errors and any rejection from `onChange`. */
  onError: (err: unknown) => void
}

/**
 * Run `onChange` after edits to config files, debounced and never overlapping: a
 * change that lands mid-run queues exactly one more run once it settles.
 *
 * Watches the parent directory and filters by filename, because a watch on the
 * file itself loses its target when an editor atomic-saves (delete + rename).
 */
export function watchConfigFiles({
  dir,
  filenames,
  onChange,
  onError,
}: WatchConfigFilesOptions): ConfigFileWatcher {
  const watchFilenames = new Set(filenames)

  let running = false
  let pending = false
  let closed = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const run = async () => {
    if (closed) return

    if (running) {
      pending = true
      return
    }

    running = true
    try {
      await onChange()
    } catch (err) {
      onError(err)
    } finally {
      running = false
      if (pending && !closed) {
        pending = false
        void run()
      }
    }
  }

  const watcher = watch(canonicalizeWatchDir(dir), (_event, filename) => {
    if (!filename || !watchFilenames.has(filename)) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void run(), DEBOUNCE_MS)
  })
  watcher.on('error', onError)

  return {
    close: () => {
      if (closed) return
      closed = true
      clearTimeout(debounceTimer)
      watcher.close()
    },
    run: () => void run(),
  }
}
