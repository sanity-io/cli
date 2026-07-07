// The build-facing entry of the workbench federation stack: turn a workbench
// app's build inputs into the Vite plugins that produce its module-federation
// remote. `@sanity/cli-build`'s `getViteConfig` calls this instead of
// assembling `federation`'s options itself, so the discriminated app-vs-studio
// option shape, the no-app-view rule, and the studio-config requirement all
// live here next to `federation` — the build package just hands over its inputs.

import path from 'node:path'

import {readPackageJson} from '@sanity/cli-core'
import {type PluginOption} from 'vite'

import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'
import {federation} from './plugin.js'
import {sanityAppId} from './plugins/plugin-sanity-app-id.js'

interface WorkbenchViteOptions {
  /** Project root — read for the federation remote name, and the plugin workDir. */
  cwd: string
  /**
   * Build entry paths relative to the federation runtime dir. `relativeEntry` is
   * the app's `entry` (null for a dock-only app with no app view);
   * `relativeConfigLocation` is the studio's `sanity.config.*` (null when absent).
   */
  entries: {relativeConfigLocation: string | null; relativeEntry: string | null}

  /** The app's bus identity, stamped into its modules for `@sanity/runtime`. */
  appId?: string

  /** Dev server build — surfaces type-generation errors only in dev, not production. */
  dev?: boolean
  exposes?: WorkbenchExposes
  /** App (vs studio) build — selects the discriminated federation option shape. */
  isApp?: boolean
}

/**
 * A workbench studio renders from its `sanity.config.*`, so the build needs one.
 * An explicit `applicationType: 'studio'` wins over detection, so a studio can
 * reach here with no config file — fail with the fix rather than a cryptic build
 * error downstream.
 */
function requireStudioConfigPath(relativeConfigLocation: string | null): string {
  if (relativeConfigLocation === null) {
    throw new Error(
      'Workbench studios need a sanity.config.js or sanity.config.ts file. ' +
        "Add one, or remove `applicationType: 'studio'` from `unstable_defineApp` " +
        'to let the CLI infer the application type.',
    )
  }
  return relativeConfigLocation
}

/** Build the Vite plugins for a workbench app's module-federation remote. */
export async function workbenchVitePlugins(options: WorkbenchViteOptions): Promise<PluginOption> {
  const {appId, cwd, dev, entries, exposes, isApp} = options
  const pkgJson = await readPackageJson(path.join(cwd, 'package.json'))

  const federationPlugin = federation({
    dev,
    ...(isApp
      ? {
          // `null` relativeEntry (a branded app with no `entry`) → omit `appEntry`,
          // so the remote exposes no `./App`, only its views.
          ...(entries.relativeEntry ? {appEntry: entries.relativeEntry} : {}),
          isApp: true as const,
        }
      : {
          isApp: false as const,
          studioConfigPath: requireStudioConfigPath(entries.relativeConfigLocation),
        }),
    exposes,
    pkgJson,
    workDir: cwd,
  })

  return appId === undefined ? federationPlugin : [federationPlugin, sanityAppId(appId)]
}
