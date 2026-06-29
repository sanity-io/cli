// The deploy command's view of a workbench app: the resolved interfaces plus
// the deploy-time guards that need the app's declarations. `sanity deploy` calls
// `getWorkbench(config)` once and either gets `null` (plain project — normal
// deploy) or an object it asks to validate the app before shipping.

import {type CliConfig} from '@sanity/cli-core/types'

import {type ResolvedWorkbenchApp, resolveWorkbenchApp} from '../../resolveWorkbenchApp.js'
import {buildViewDeploymentPayload, type ViewDeploymentPayload} from './viewDeployment.js'

interface DeployableWorkbenchApp extends ResolvedWorkbenchApp {
  /**
   * Throws when the app declares nothing the build can expose — no entry, view
   * or service. A federated app with none would ship a remote with nothing to
   * load, so deploy gates on this before any prompts or API calls.
   */
  assertDeployable(): void
  /**
   * Validates the app's declared views into the application-service payload.
   * Throws when a view declaration is malformed.
   */
  buildViewDeploymentPayload(applicationId: string): ViewDeploymentPayload
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

    buildViewDeploymentPayload(applicationId) {
      return buildViewDeploymentPayload({applicationId, views})
    },
  }
}
