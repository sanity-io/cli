import {type CliConfig, type Output} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import {resolveWorkbenchApp, resolveWorkbenchConfig} from '@sanity/workbench-cli/build'

import {ensureAppFunctionStackResource} from '../../services/appFunctionStacks.js'
import {getOrganization} from '../../services/organizations.js'
import {getAppId, resolveAppIdIssue} from '../../util/appId.js'
import {hasAppFunctionBuild} from './appFunctionManifest.js'
import {
  type AppFunctionState,
  readAppFunctionState,
  writeAppFunctionState,
} from './appFunctionState.js'
import {discoverAppFunctions} from './discoverAppFunctions.js'
import {resolveFunctionApp} from './resolveFunctionApp.js'

export async function ensureAppFunctionStack({
  allowCreateApp = true,
  cliConfig,
  create = false,
  dryRun = false,
  output,
  selectExisting = false,
  title,
  unattended = false,
  useBuild = false,
  workDir,
}: {
  allowCreateApp?: boolean
  cliConfig: CliConfig
  create?: boolean
  dryRun?: boolean
  output: Output
  selectExisting?: boolean
  title?: string
  unattended?: boolean
  useBuild?: boolean
  workDir: string
}): Promise<{appId?: string; createdApp: boolean; stackId?: string} | null> {
  const hasBuild = await hasAppFunctionBuild(workDir)
  const functions = useBuild && hasBuild ? [] : await discoverAppFunctions(workDir)
  const saved = await readAppFunctionState(workDir)
  const environment = isStaging() ? 'staging' : 'production'
  const appKind = resolveWorkbenchApp(cliConfig) ? 'workbench' : 'coreApp'
  const cached =
    saved?.organizationId === cliConfig.app?.organizationId &&
    saved?.environment === environment &&
    saved?.appKind === appKind
      ? saved
      : null
  // Keep managing an existing stack when the last function is removed.
  if (functions.length === 0 && !cached && !hasBuild) return null
  if (resolveWorkbenchConfig(cliConfig)) {
    throw new Error('Functions require an SDK app. Move the functions to an app project.')
  }
  if (resolveAppIdIssue(cliConfig) === 'conflicting-config') {
    throw new Error(
      'Both app.id and deployment.appId are configured. Remove app.id from sanity.cli.ts.',
    )
  }
  const organizationId = cliConfig.app?.organizationId
  if (!organizationId) {
    throw new Error(
      'App functions require an organization. Set app.organizationId in sanity.cli.ts.',
    )
  }
  try {
    await getOrganization(organizationId)
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
    if (status === 403 || status === 404) {
      throw new Error(
        `Organization "${organizationId}" was not found or is not accessible. Check app.organizationId in sanity.cli.ts and your account's access.`,
        {cause: error},
      )
    }
    throw error
  }

  const app = await resolveFunctionApp({
    allowCreateApp,
    appId: getAppId(cliConfig) ?? (create ? undefined : cached?.appId),
    cliConfig,
    dryRun,
    organizationId,
    output,
    selectExisting,
    title,
    unattended,
    workDir,
  })
  if (!app) return {createdApp: false}

  const state: AppFunctionState = {
    appId: app.id,
    appKind,
    environment,
    organizationId,
    ...(cached?.appId === app.id && cached.stackId ? {stackId: cached.stackId} : {}),
    version: 1,
  }
  // Save the app before creating its stack so a failed request can be retried
  // without registering another application. Build output cleanup leaves this file intact.
  if (!dryRun) await writeAppFunctionState(workDir, state)
  if (app.created) {
    output.log(
      `Registered app ${app.id}. Set deployment.appId to '${app.id}' in sanity.cli.ts for other checkouts and CI.`,
    )
  }
  const stack = await ensureAppFunctionStackResource({
    appId: app.id,
    dryRun,
    organizationId,
    stackId: state.stackId,
  })
  if (stack && !dryRun) {
    await writeAppFunctionState(workDir, {...state, stackId: stack.id})
    output.log(`${stack.created ? 'Created' : 'Using'} app function stack ${stack.id}`)
  }
  return {appId: app.id, createdApp: app.created, ...(stack ? {stackId: stack.id} : {})}
}
