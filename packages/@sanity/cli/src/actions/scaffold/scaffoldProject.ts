import {existsSync} from 'node:fs'
import path from 'node:path'

import {type CLITelemetryStore, type Output, subdebug} from '@sanity/cli-core'
import {type Framework, frameworks} from '@vercel/frameworks'

import {CLIInitStepCompleted} from '../../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../../util/detectFramework.js'
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

const STUDIO_PACKAGE_NAME = 'sanity-studio'

const STUDIO_PACKAGE_MANAGERS = new Set<PackageManager>(['npm', 'pnpm', 'yarn'])

export function manualScaffoldCommands(options: {dataset: string; projectId: string}): string[] {
  const {dataset, projectId} = options
  return [
    `npx sanity init --project ${projectId} --dataset ${dataset} --output-path ${STUDIO_DIR} --no-mcp --no-skills --no-git -y`,
    frontendScaffoldCommand(FRONTEND_DIR),
  ]
}

/** Display paths, so guidance reads the same on every platform and callers can key off them. */
export const STUDIO_ENV_FILE = `${STUDIO_DIR}/.env.local`
export const FRONTEND_ENV_FILE = `${FRONTEND_DIR}/.env.local`

export function existingScaffoldEnvFiles(workDir: string): string[] {
  return [STUDIO_ENV_FILE, FRONTEND_ENV_FILE].filter((relative) =>
    existsSync(path.join(workDir, relative)),
  )
}

export interface ScaffoldResult {
  frontendEnv: Record<string, string>
  frontendEnvWritten: boolean
  studioPath: string
  warnings: string[]

  detectedFramework?: string
  frontendPackageManager?: PackageManager
  frontendPath?: string
}

// The token goes to `.env.local`, never `.env`: the scaffolded `.gitignore` covers `*.local` only.
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
  const detected = await detectFrameworkRecord({
    frameworkList: frameworks as readonly Framework[],
    rootPath: workDir,
  })
  const studioPath = path.join(workDir, STUDIO_DIR)
  const warnings: string[] = []

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
    // A nested repository would not inherit the root `.gitignore` that keeps the token out of git.
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
  if (!studioEnvWritten) {
    warnings.push(
      `Couldn't write ${STUDIO_DIR}/.env.local. Add SANITY_AUTH_TOKEN to it yourself, from ./.env.`,
    )
  }

  const frontendEnv = {
    NEXT_PUBLIC_SANITY_DATASET: dataset,
    NEXT_PUBLIC_SANITY_PROJECT_ID: projectId,
  }

  if (detected) {
    debug('Detected %s in %s, leaving the frontend alone', detected.name, workDir)
    return {
      detectedFramework: detected.name,
      frontendEnv,
      frontendEnvWritten: false,
      studioPath,
      warnings,
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
      warnings.push(
        `${err.message}. Scaffold it with \`${frontendScaffoldCommand(FRONTEND_DIR)}\`, ` +
          'then add the env values below.',
      )
      return {frontendEnv, frontendEnvWritten: false, studioPath, warnings}
    }
    throw err
  }

  const frontendPath = path.join(workDir, FRONTEND_DIR)

  const frontendEnvWritten = writeScaffoldEnv(
    path.join(frontendPath, '.env.local'),
    frontendEnv,
    'Added by `sanity new`.',
  )
  if (!frontendEnvWritten) {
    warnings.push(`Couldn't write ${FRONTEND_DIR}/.env.local.`)
  }

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
    warnings.push(`${err.message}. Run the install yourself in ./${FRONTEND_DIR}.`)
  }

  return {
    frontendEnv,
    frontendEnvWritten,
    frontendPackageManager: resolvedPackageManager,
    frontendPath,
    studioPath,
    warnings,
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
