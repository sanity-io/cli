// The deploy command's view of a workbench app: the resolved interfaces plus
// the two deploy-time guards. `sanity deploy` calls `getWorkbench(config)` once
// and either gets `null` (plain project — normal deploy) or an object it asks
// to validate the app and its build output before shipping.
//
// Node-only (the build-output guard touches the filesystem).

import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {type CliConfig} from '@sanity/cli-core/types'

import {type ResolvedWorkbenchApp, resolveWorkbenchApp} from '../../resolveWorkbenchApp.js'

interface DeployableWorkbenchApp extends ResolvedWorkbenchApp {
  /**
   * Throws when the app declares nothing the build can expose — no entry, view
   * or service. A federated app with none would ship a remote with nothing to
   * load, so deploy gates on this before any prompts or API calls.
   */
  assertDeployable(): void
  /**
   * Throws unless `sourceDir` is a directory holding a federation build.
   * Workbench builds emit a module-federation remote instead of a static SPA,
   * so the usual `index.html` contract doesn't apply — `mf-manifest.json` is the
   * marker that `sanity build` produced a federation build.
   */
  checkBuiltOutput(sourceDir: string): Promise<void>
}

export function getWorkbench(
  cliConfig: CliConfig | null | undefined,
): DeployableWorkbenchApp | null {
  const app = resolveWorkbenchApp(cliConfig)
  if (!app) return null

  const {entry, services, views} = app

  return {
    ...app,

    assertDeployable() {
      if (!entry && views.length === 0 && services.length === 0) {
        throw new Error(
          'Nothing to deploy: `unstable_defineApp` declares no entry, views or services. ' +
            'Add at least one to the app config.',
        )
      }
    },

    async checkBuiltOutput(sourceDir) {
      try {
        const stats = await stat(sourceDir)
        if (!stats.isDirectory()) {
          throw new Error(`"${sourceDir}" is not a directory`)
        }
      } catch (err) {
        throw err.code === 'ENOENT' ? new Error(`Directory "${sourceDir}" does not exist`) : err
      }

      const manifestPath = join(sourceDir, 'mf-manifest.json')
      try {
        await stat(manifestPath)
      } catch (err) {
        throw err.code === 'ENOENT'
          ? new Error(
              `"${manifestPath}" does not exist. ` +
                'The deploy directory must contain a federation build created with "sanity build".',
            )
          : err
      }
    },
  }
}
