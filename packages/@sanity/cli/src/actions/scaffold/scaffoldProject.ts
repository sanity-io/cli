import {writeFileSync} from 'node:fs'
import {lstat} from 'node:fs/promises'
import path from 'node:path'

import {type CLITelemetryStore, type Output, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Framework, frameworks} from '@vercel/frameworks'

import {CLIInitStepCompleted} from '../../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../../util/detectFramework.js'
import {dirIsEmptyOrNonExistent} from '../../util/dirIsEmptyOrNonExistent.js'
import {getProjectDefaults} from '../../util/getProjectDefaults.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {initStudio} from '../init/initStudio.js'
import {resolvePackageManager} from '../init/resolvePackageManager.js'
import {type InitOptions} from '../init/types.js'
import {createFrontend, FrontendScaffoldError, installFrontendDeps} from './createFrontend.js'

const debug = subdebug('scaffold')

export const STUDIO_DIR = 'sanity'
export const FRONTEND_DIR = 'web'
export const STUDIO_ENV_FILE = `${STUDIO_DIR}/.env.local`
export const FRONTEND_ENV_FILE = `${FRONTEND_DIR}/.env.local`

const STUDIO_PACKAGE_NAME = 'sanity-studio'
const STUDIO_PACKAGE_MANAGERS = new Set<PackageManager>(['npm', 'pnpm', 'yarn'])

export async function isStudioScaffoldTargetAvailable(workDir: string): Promise<boolean> {
  return isScaffoldTargetAvailable(workDir, STUDIO_DIR)
}

async function isScaffoldTargetAvailable(workDir: string, targetDir: string): Promise<boolean> {
  const targetPath = path.join(workDir, targetDir)
  try {
    if (!(await lstat(targetPath)).isDirectory()) {
      return false
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }

  return dirIsEmptyOrNonExistent(targetPath)
}

async function inspectScaffoldTargets(workDir: string) {
  if (!(await isStudioScaffoldTargetAvailable(workDir))) {
    return {unavailableTarget: STUDIO_DIR}
  }

  const detectedFramework = await detectFrameworkRecord({
    frameworkList: frameworks as readonly Framework[],
    rootPath: workDir,
  })
  if (!detectedFramework && !(await isScaffoldTargetAvailable(workDir, FRONTEND_DIR))) {
    return {unavailableTarget: FRONTEND_DIR}
  }

  return {detectedFramework}
}

export async function getUnavailableScaffoldTarget(workDir: string): Promise<string | undefined> {
  const {unavailableTarget} = await inspectScaffoldTargets(workDir)
  return unavailableTarget
}

export interface ScaffoldResult {
  studioPath: string

  detectedFramework?: string
  frontendCreationError?: string
  frontendDependenciesInstalled?: boolean
  frontendDependencyError?: string
  frontendPackageManager?: PackageManager
  frontendPath?: string
}

function createScaffoldEnv(dataset: string, projectId: string, token: string) {
  return {
    SANITY_AUTH_TOKEN: token,
    SANITY_DATASET: dataset,
    SANITY_PROJECT_ID: projectId,
  }
}

export async function scaffoldProject({
  cancelSignal,
  dataset,
  displayName,
  output,
  packageManager,
  projectId,
  telemetry,
  token,
  workDir,
}: {
  cancelSignal?: AbortSignal
  dataset: string
  displayName: string
  output: Output
  packageManager?: PackageManager
  projectId: string
  telemetry: CLITelemetryStore
  token: string
  workDir: string
}): Promise<ScaffoldResult> {
  cancelSignal?.throwIfAborted()
  const {detectedFramework: detected, unavailableTarget} = await inspectScaffoldTargets(workDir)
  const studioPath = path.join(workDir, STUDIO_DIR)
  if (unavailableTarget) {
    throw new Error(`./${unavailableTarget} is not an empty directory`)
  }

  const resolvedPackageManager = await resolvePackageManager({
    interactive: false,
    output,
    packageManager: packageManager as PackageManager,
    targetDir: workDir,
  })

  const options: InitOptions = {
    autoUpdates: true,
    bare: false,
    dataset,
    datasetDefault: true,
    fromCreate: false,
    git: false,
    mcpMode: 'skip',
    outputPath: studioPath,
    packageManager: STUDIO_PACKAGE_MANAGERS.has(resolvedPackageManager)
      ? (resolvedPackageManager as InitOptions['packageManager'])
      : undefined,
    project: projectId,
    skillsMode: 'skip',
    template: 'clean',
    typescript: true,
    unattended: true,
  }

  const trace = telemetry.trace(CLIInitStepCompleted)
  trace.start()
  try {
    // To avoid changing Studio initialization internals, we're deferring passing `cancelSignal`
    // until post `sanity new` launch.
    await initStudio({
      datasetName: dataset,
      defaults: await getProjectDefaults({isPlugin: false, workDir}),
      displayName,
      isFirstProject: false,
      mcpConfigured: [],
      options,
      organizationId: undefined,
      output,
      outputPath: studioPath,
      preclaim: true,
      projectId,
      remoteTemplateInfo: undefined,
      sluggedName: STUDIO_PACKAGE_NAME,
      trace,
      workbench: false,
      workDir,
    })
    trace.complete()
  } catch (err) {
    trace.error(err instanceof Error ? err : new Error(String(err)))
    throw err
  }

  cancelSignal?.throwIfAborted()
  const scaffoldEnv = createScaffoldEnv(dataset, projectId, token)
  writeScaffoldEnv(
    path.join(studioPath, '.env.local'),
    scaffoldEnv,
    `Studio scaffold completed, but writing ./${STUDIO_ENV_FILE} failed`,
  )

  if (detected) {
    debug('Detected %s in %s, leaving the frontend alone', detected.name, workDir)
    return {
      detectedFramework: detected.name,
      studioPath,
    }
  }

  try {
    await createFrontend({
      cancelSignal,
      dirName: FRONTEND_DIR,
      output,
      packageManager: resolvedPackageManager,
      workDir,
    })
    cancelSignal?.throwIfAborted()
  } catch (err) {
    if (err instanceof FrontendScaffoldError) {
      return {
        frontendCreationError: err.message,
        frontendPackageManager: resolvedPackageManager,
        studioPath,
      }
    }
    throw err
  }

  const frontendPath = path.join(workDir, FRONTEND_DIR)
  writeScaffoldEnv(
    path.join(frontendPath, '.env.local'),
    scaffoldEnv,
    `Website scaffold completed, but writing ./${FRONTEND_ENV_FILE} failed`,
  )

  let frontendDependenciesInstalled = resolvedPackageManager !== 'manual'
  let frontendDependencyError: string | undefined
  if (frontendDependenciesInstalled) {
    try {
      await installFrontendDeps({
        cancelSignal,
        dirName: FRONTEND_DIR,
        output,
        packageManager: resolvedPackageManager,
        workDir,
      })
      cancelSignal?.throwIfAborted()
    } catch (err) {
      if (!(err instanceof FrontendScaffoldError)) throw err
      frontendDependenciesInstalled = false
      frontendDependencyError = err.message
    }
  }

  return {
    frontendDependenciesInstalled,
    frontendDependencyError,
    frontendPackageManager: resolvedPackageManager,
    frontendPath,
    studioPath,
  }
}

function writeScaffoldEnv(
  envPath: string,
  values: Record<string, string>,
  errorContext: string,
): void {
  const lines = [
    '# Added by `sanity new`. Keep this file out of git: it holds a live project token.',
    ...Object.entries(values).map(([key, value]) => `${key}="${value}"`),
  ]
  try {
    writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf8')
  } catch (err) {
    throw new Error(`${errorContext}: ${getErrorMessage(err)}`, {cause: err})
  }
}
