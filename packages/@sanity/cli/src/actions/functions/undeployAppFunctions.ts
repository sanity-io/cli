import {rm} from 'node:fs/promises'
import path from 'node:path'

import {type CliConfig, type Output} from '@sanity/cli-core'
import {type UndeployAdapter, type UndeployTarget} from '@sanity/cli-core/undeploy'
import {isStaging} from '@sanity/cli-core/util'
import {resolveWorkbenchApp} from '@sanity/workbench-cli/build'

import {createAppFunctionCleanupClient} from '../../services/appFunctionCleanup.js'
import {getAppId} from '../../util/appId.js'
import {type AppFunctionState, readAppFunctionState} from './appFunctionState.js'

interface AppFunctionCleanupContext {
  appId: string
  organizationId: string
  state: AppFunctionState | null
  workDir: string | undefined
}

/** Resolve only local identity here; remote lookup happens with the undeploy plan. */
export async function resolveAppFunctionCleanupContext(
  cliConfig: CliConfig,
  workDir?: string,
): Promise<AppFunctionCleanupContext | null> {
  const organizationId = cliConfig.app?.organizationId
  if (!organizationId) return null
  const saved = workDir ? await readAppFunctionState(workDir) : null
  const matching =
    saved?.organizationId === organizationId &&
    saved.environment === (isStaging() ? 'staging' : 'production') &&
    saved.appKind === (resolveWorkbenchApp(cliConfig) ? 'workbench' : 'coreApp')
      ? saved
      : null
  const appId = getAppId(cliConfig) ?? matching?.appId
  if (!appId) return null
  const state = matching?.appId === appId ? matching : null
  return {appId, organizationId, state, workDir}
}

/** Add function cleanup to either app backend, including orphaned stacks. */
export function withAppFunctionCleanup(
  adapter: UndeployAdapter,
  context: AppFunctionCleanupContext,
  output: Output,
): UndeployAdapter {
  const {appId, organizationId, state} = context
  let applicationTarget: UndeployTarget | undefined
  let stackId: string | undefined
  let client: Awaited<ReturnType<typeof createAppFunctionCleanupClient>> | undefined

  return {
    async resolveTarget() {
      applicationTarget = undefined
      stackId = undefined
      client = undefined
      const resolution = await adapter.resolveTarget()
      if (resolution.type === 'found') {
        if (resolution.target.deletes !== 'application') return resolution
        applicationTarget = resolution.target
        assertApplicationScope(applicationTarget, context)
      }
      client = await createAppFunctionCleanupClient((message) => output.log(message))
      const stack = await client.inspect({appId, organizationId, stackId: state?.stackId})
      stackId = stack?.id
      if (!stack && !state) return resolution
      const target: UndeployTarget = applicationTarget ?? {
        deletes: 'functionStack',
        id: appId,
        title: null,
        type: 'coreApp',
        url: null,
      }
      return {
        target: {
          ...target,
          payload: {
            ...target.payload,
            appId,
            functions: stack?.functions.map((name) => ({name})),
            functionStackId: stackId,
            organizationId,
            type: 'coreApp',
          },
          summary: [
            ...(target.summary ?? []),
            ...(stack
              ? [
                  `Deletes function stack ${stack.id}`,
                  `Functions: ${stack.functions.join(', ') || '(none)'}`,
                ]
              : []),
            ...(state ? ['Clears the saved app function binding after cleanup'] : []),
          ],
        },
        type: 'found',
      }
    },
    type: adapter.type,
    async undeploy(target) {
      if (target.deletes === 'config') return adapter.undeploy(target)
      if (!client) throw new Error('Resolve the app function cleanup plan before undeploying.')
      if (stackId) await client.destroy({appId, organizationId, stackId})
      if (applicationTarget) await adapter.undeploy(applicationTarget)
      await clearAppFunctionBinding(context)
    },
  }
}

function assertApplicationScope(
  target: UndeployTarget,
  {appId, organizationId}: AppFunctionCleanupContext,
): void {
  const app = target.application
  if (
    target.id !== appId ||
    (app && 'organizationId' in app && app.organizationId !== organizationId)
  ) {
    throw new Error('The application does not match the function binding. Check sanity.cli.ts.')
  }
}

async function clearAppFunctionBinding({state, workDir}: AppFunctionCleanupContext): Promise<void> {
  if (!state || !workDir) return
  const current = await readAppFunctionState(workDir)
  // Preserve another app's binding, or one changed by a concurrent build.
  if (JSON.stringify(current) !== JSON.stringify(state)) return
  await rm(path.join(workDir, '.sanity', 'functions'), {force: true, recursive: true})
  await rm(path.join(workDir, '.sanity', 'app-functions-entry.js'), {force: true})
  await rm(path.join(workDir, '.sanity', 'app-functions.json'), {force: true})
}
