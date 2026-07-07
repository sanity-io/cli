import {type Plugin} from 'vite'

/**
 * Bake the app's bus identity into its bundle: `@sanity/runtime` reads
 * `__SANITY_APP_ID__` where it connects. `define` covers everything the
 * pipeline transforms (all of a production build, and dev-served source); the
 * esbuild define covers dev's pre-bundled dependencies, which skip Vite's
 * define transform.
 */
export function sanityAppId(appId: string): Plugin {
  const define = {__SANITY_APP_ID__: JSON.stringify(appId)}
  return {
    config: () => ({define, optimizeDeps: {esbuildOptions: {define}}}),
    name: 'sanity/workbench/app-id',
  }
}
