import {getTimer, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {type ExtractSchemaWorkerError} from '../schema/types.js'
import {SchemaExtractionError} from '../schema/utils/SchemaExtractionError.js'
import {manifestDebug} from './debug.js'
import {type CreateWorkspaceManifest, type ExtractManifestWorkerData} from './types'
import {writeManifestFile, type WriteManifestFileOptions} from './writeManifestFile.js'

const CREATE_TIMER = 'create-manifest'

interface ExtractManifestWorkerResult {
  type: 'success'
  workspaceManifests: CreateWorkspaceManifest[]
}

type ExtractManifestWorkerMessage = ExtractManifestWorkerResult | ExtractSchemaWorkerError

interface ExtractManifestOptions extends Pick<WriteManifestFileOptions, 'outPath' | 'workDir'> {
  /** Absolute path to the studio's `sanity.config.(ts|js)` entry file. */
  path: string
}

export async function extractManifest({
  outPath,
  path,
  workDir,
}: ExtractManifestOptions): Promise<void> {
  manifestDebug('Project root %o', {directory: workDir, path})

  const timer = getTimer()
  timer.start(CREATE_TIMER)
  const spin = spinner('Extracting manifest').start()

  try {
    const result = await studioWorkerTask<ExtractManifestWorkerMessage>(
      new URL('extractManifest.worker.js', import.meta.url),
      {
        name: 'extractManifest',
        studioRootPath: workDir,
        workerData: {configPath: path, workDir} satisfies ExtractManifestWorkerData,
      },
    )

    manifestDebug('Result %o', result)

    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    await writeManifestFile({
      outPath,
      workDir,
      workspaceManifests: result.workspaceManifests,
    })

    const manifestDuration = timer.end(CREATE_TIMER)

    spin.succeed(`Extracted manifest (${manifestDuration.toFixed(0)}ms)`)
  } catch (err) {
    manifestDebug('Error extracting manifest', err)
    spin.fail()

    throw err
  }
}
