import {mkdir, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {findProjectRoot, getTimer, Output, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {readModuleVersion} from '../../util/readModuleVersion.js'
import {type ExtractSchemaWorkerError} from '../schema/types.js'
import {SchemaExtractionError} from '../schema/utils/SchemaExtractionError.js'
import {manifestDebug} from './debug.js'
import {
  type CreateManifest,
  type CreateWorkspaceManifest,
  type ExtractManifestWorkerData,
} from './types'
import {writeWorkspaceFiles} from './writeWorkspaceFiles.js'

export const MANIFEST_FILENAME = 'create-manifest.json'

/** Escape-hatch env flags to change action behavior */
const FEATURE_ENABLED_ENV_NAME = 'SANITY_CLI_EXTRACT_MANIFEST_ENABLED'
const EXTRACT_MANIFEST_ENABLED = process.env[FEATURE_ENABLED_ENV_NAME] !== 'false'
const EXTRACT_MANIFEST_LOG_ERRORS = process.env.SANITY_CLI_EXTRACT_MANIFEST_LOG_ERRORS === 'true'

const CREATE_TIMER = 'create-manifest'

interface ExtractManifestOptions {
  outPath: string
  output: Output
}

/**
 * This function will never throw.
 * @returns `undefined` if extract succeeded - caught error if it failed
 */
export async function extractManifestSafe(
  options: ExtractManifestOptions,
): Promise<Error | undefined> {
  const {outPath, output} = options
  if (!EXTRACT_MANIFEST_ENABLED) {
    return undefined
  }

  try {
    await extractManifest(outPath)
    return undefined
  } catch (err) {
    if (EXTRACT_MANIFEST_LOG_ERRORS) {
      output.error(err)
    }
    return err
  }
}

interface ExtractManifestWorkerResult {
  type: 'success'
  workspaceManifests: CreateWorkspaceManifest[]
}

type ExtractManifestWorkerMessage = ExtractManifestWorkerResult | ExtractSchemaWorkerError

export async function extractManifest(outPath: string): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd())

  const workDir = projectRoot.directory
  const configPath = projectRoot.path
  const staticPath = resolve(join(workDir, outPath))
  const path = join(staticPath, MANIFEST_FILENAME)

  const timer = getTimer()
  timer.start(CREATE_TIMER)
  const spin = spinner('Extracting manifest').start()

  try {
    const result = await studioWorkerTask<ExtractManifestWorkerMessage>(
      new URL('extractManifest.worker.js', import.meta.url),
      {
        name: 'extractManifest',
        studioRootPath: workDir,
        workerData: {configPath, workDir} satisfies ExtractManifestWorkerData,
      },
    )

    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    await mkdir(staticPath, {recursive: true})

    const workspaceFiles = await writeWorkspaceFiles(result.workspaceManifests, staticPath)

    const manifest: CreateManifest = {
      /**
       * Version history:
       * 1: Initial release.
       * 2: Added tools file.
       * 3. Added studioVersion field.
       */
      createdAt: new Date().toISOString(),
      studioVersion: await readModuleVersion(workDir, 'sanity'),
      version: 3,
      workspaces: workspaceFiles,
    }

    await writeFile(path, JSON.stringify(manifest, null, 2))
    const manifestDuration = timer.end(CREATE_TIMER)

    spin.succeed(`Extracted manifest (${manifestDuration.toFixed(0)}ms)`)
  } catch (err) {
    manifestDebug('Error extracting manifest', err)
    spin.fail()

    throw err
  }
}
