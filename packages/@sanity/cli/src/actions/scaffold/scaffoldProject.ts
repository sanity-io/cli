import path from 'node:path'

import {type CLITelemetryStore, type Output, subdebug} from '@sanity/cli-core'
import {type Framework, frameworks} from '@vercel/frameworks'

import {CLIInitStepCompleted} from '../../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../../util/detectFramework.js'
import {dirIsEmptyOrNonExistent} from '../../util/dirIsEmptyOrNonExistent.js'
import {appendEnvValues} from '../../util/envFile.js'
import {getProjectDefaults} from '../../util/getProjectDefaults.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {initStudio} from '../init/initStudio.js'
import {resolvePackageManager} from '../init/resolvePackageManager.js'
import {type InitOptions} from '../init/types.js'
import {
  createFrontend,
  frontendScaffoldCommand,
  FrontendScaffoldError,
  installFrontendDeps,
} from './createFrontend.js'

const debug = subdebug('scaffold')

export const STUDIO_DIR = 'sanity'
export const FRONTEND_DIR = 'web'
export const STUDIO_ENV_FILE = `${STUDIO_DIR}/.env.local`
export const FRONTEND_ENV_FILE = `${FRONTEND_DIR}/.env.local`

const NEXTJS_ENV_PREFIX = 'NEXT_PUBLIC_'
const STUDIO_PACKAGE_NAME = 'sanity-studio'
const STUDIO_PACKAGE_MANAGERS = new Set<PackageManager>(['npm', 'pnpm', 'yarn'])

export const FRONTEND_ENV_PREFIX_OVERRIDES = {
  nuxtjs: 'NUXT_PUBLIC_',
  'sveltekit-1': 'PUBLIC_',
} as const satisfies Record<string, string>

export function manualScaffoldCommands(options: {
  dataset: string
  projectId: string
}): [studio: string, frontend: string] {
  const {dataset, projectId} = options
  return [
    `npx sanity init --project ${projectId} --dataset ${dataset} --output-path ${STUDIO_DIR} --no-mcp --no-skills --no-git -y`,
    frontendScaffoldCommand(FRONTEND_DIR),
  ]
}

export function isStudioScaffoldTargetAvailable(workDir: string): Promise<boolean> {
  return dirIsEmptyOrNonExistent(path.join(workDir, STUDIO_DIR))
}

export interface ScaffoldResult {
  frontendEnv: Record<string, string>
  frontendEnvWritten: boolean
  studioEnvWritten: boolean
  studioPath: string

  detectedFramework?: string
  frontendCreationError?: string
  frontendDependenciesInstalled?: boolean
  frontendDependencyError?: string
  frontendEnvPrefix?: string
  frontendPackageManager?: PackageManager
  frontendPath?: string
}

function resolveFrontendEnvPrefix(detected: Framework): string | undefined {
  const override =
    FRONTEND_ENV_PREFIX_OVERRIDES[detected.slug as keyof typeof FRONTEND_ENV_PREFIX_OVERRIDES]
  return (override ?? detected.envPrefix?.trim()) || undefined
}

function createFrontendEnv(
  dataset: string,
  projectId: string,
  prefix: string,
): Record<string, string> {
  return {
    [`${prefix}SANITY_DATASET`]: dataset,
    [`${prefix}SANITY_PROJECT_ID`]: projectId,
  }
}

export async function scaffoldProject({
  cancelSignal,
  dataset,
  displayName,
  onFrameworkDetected,
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
  onFrameworkDetected?: (framework: string | undefined) => void
  output: Output
  packageManager?: PackageManager
  projectId: string
  telemetry: CLITelemetryStore
  token: string
  workDir: string
}): Promise<ScaffoldResult> {
  cancelSignal?.throwIfAborted()
  const detected = await detectFrameworkRecord({
    frameworkList: frameworks as readonly Framework[],
    rootPath: workDir,
  })
  onFrameworkDetected?.(detected?.name)
  const studioPath = path.join(workDir, STUDIO_DIR)
  if (!(await isStudioScaffoldTargetAvailable(workDir))) {
    throw new Error(`./${STUDIO_DIR} is not empty`)
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
  const studioEnvWritten = writeScaffoldEnv(
    path.join(studioPath, '.env.local'),
    {SANITY_AUTH_TOKEN: token},
    'Added by `sanity new`. Keep this file out of git: it holds a live project token.',
  )

  const frontendEnvPrefix = detected ? resolveFrontendEnvPrefix(detected) : NEXTJS_ENV_PREFIX
  const frontendEnv = createFrontendEnv(dataset, projectId, frontendEnvPrefix ?? NEXTJS_ENV_PREFIX)

  if (detected) {
    debug('Detected %s in %s, leaving the frontend alone', detected.name, workDir)
    return {
      detectedFramework: detected.name,
      frontendEnv,
      frontendEnvPrefix,
      frontendEnvWritten: false,
      studioEnvWritten,
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
        frontendEnv,
        frontendEnvPrefix,
        frontendEnvWritten: false,
        studioEnvWritten,
        studioPath,
      }
    }
    throw err
  }

  const frontendPath = path.join(workDir, FRONTEND_DIR)
  const frontendEnvWritten = writeScaffoldEnv(
    path.join(frontendPath, '.env.local'),
    frontendEnv,
    'Added by `sanity new`.',
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
    frontendEnv,
    frontendEnvPrefix,
    frontendEnvWritten,
    frontendPackageManager: resolvedPackageManager,
    frontendPath,
    studioEnvWritten,
    studioPath,
  }
}

function writeScaffoldEnv(
  envPath: string,
  values: Record<string, string>,
  banner: string,
): boolean {
  try {
    const written = appendEnvValues(envPath, values, {banner: [banner]})
    if (written.skippedKeys.length > 0) {
      debug('%s already had %s; values not written', envPath, written.skippedKeys.join(', '))
      return false
    }
    return true
  } catch (err) {
    debug('Failed writing %s: %O', envPath, err)
    return false
  }
}
