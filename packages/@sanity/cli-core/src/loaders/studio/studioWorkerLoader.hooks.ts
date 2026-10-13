/**
 * Node.js module customization hooks for the studio worker, registered with
 * `module.register()` (Node.js runs them on a separate hooks thread).
 *
 * The worker bundles the studio config before running its task. When the task
 * imports the config, Node.js gets the bundle as the module's source. Every
 * other module, including `sanity` and the other dependencies the bundle keeps
 * external, loads as usual.
 */
import {type InitializeHook, type LoadHook} from 'node:module'

/**
 * Bundled modules by file URL, or the error to throw when bundling failed
 *
 * @internal
 */
export type StudioWorkerHooksData = Record<string, {error: unknown} | {source: string}>

let bundles: StudioWorkerHooksData = {}

export const initialize: InitializeHook<StudioWorkerHooksData> = (data) => {
  bundles = data
}

export const load: LoadHook = async (url, context, nextLoad) => {
  const bundle = Object.hasOwn(bundles, url) ? bundles[url] : undefined
  if (!bundle) {
    return nextLoad(url, context)
  }

  if ('error' in bundle) {
    throw bundle.error
  }

  return {format: 'module', shortCircuit: true, source: bundle.source}
}
