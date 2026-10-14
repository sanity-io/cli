import {createRequire} from 'node:module'
import path from 'node:path'

/**
 * The `sanity` package entry carrying the Media Library island-mount runtime
 * (`mountIsland`). The generated `./island-runtime` federation expose
 * re-exports it, so the runtime is bundled into the config app's remote from
 * the app's own `sanity` install — whichever version the app installs brings
 * a matching runtime.
 */
export const ISLAND_RUNTIME_MODULE = 'sanity/media-library-island-runtime'

/**
 * Whether the config app's installed `sanity` ships the island runtime entry.
 * Older `sanity` versions don't; exposing a module whose import can never
 * resolve would fail the whole build, so the expose is skipped (with a
 * warning) and the Media Library host falls back to its degraded rendering
 * for custom inputs.
 */
export function hasIslandRuntime(appRoot: string): boolean {
  try {
    createRequire(path.join(appRoot, 'package.json')).resolve(ISLAND_RUNTIME_MODULE)
    return true
  } catch {
    return false
  }
}
