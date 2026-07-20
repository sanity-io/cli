import {type Plugin} from 'vite'

import {SANITY_APP_ID_FILE} from '../../../../appId.js'

/**
 * Inline the app's bus identity into its bundle: `@sanity/runtime` reads
 * `__SANITY_APP_ID__` where it connects. `define` covers everything the
 * pipeline transforms (all of a production build, and dev-served source); the
 * rolldown define covers dev's pre-bundled dependencies, which skip Vite's
 * define transform.
 *
 * A build also writes the id to disk so `sanity start`, which serves the build
 * without recompiling, can advertise the exact id the bundle uses.
 */
export function sanityAppId(appId: string): Plugin {
  const define = {__SANITY_APP_ID__: JSON.stringify(appId)}
  let emitted = false
  return {
    config: () => ({define, optimizeDeps: {rolldownOptions: {transform: {define}}}}),
    generateBundle() {
      if (emitted) return
      emitted = true
      this.emitFile({fileName: SANITY_APP_ID_FILE, source: appId, type: 'asset'})
    },
    name: 'sanity/workbench/app-id',
  }
}
