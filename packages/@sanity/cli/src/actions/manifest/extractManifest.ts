import {mkdir, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {findProjectRoot, getTimer, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {type ExtractSchemaWorkerError} from '../schema/types.js'
import {SchemaExtractionError} from '../schema/utils/SchemaExtractionError.js'
import {manifestDebug} from './debug.js'
import {
  type CreateManifest,
  type CreateWorkspaceManifest,
  type ExtractManifestWorkerData,
} from './types'
import {writeWorkspaceFiles} from './writeWorkspaceFiles.js'

const MANIFEST_FILENAME = 'create-manifest.json'
const CREATE_TIMER = 'create-manifest'

interface ExtractManifestWorkerResult {
  type: 'success'
  workspaceManifests: CreateWorkspaceManifest[]
}

type ExtractManifestWorkerMessage = ExtractManifestWorkerResult | ExtractSchemaWorkerError

export async function extractManifest(outPath: string): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd())

  manifestDebug('Project root %o', projectRoot)

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

    manifestDebug('Result %o', result)

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
      studioVersion: await getLocalPackageVersion('sanity', workDir),
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
