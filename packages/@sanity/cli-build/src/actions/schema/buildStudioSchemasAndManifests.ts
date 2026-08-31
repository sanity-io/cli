import {getCliTelemetry, studioWorkerTask, subdebug} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type StudioManifest} from 'sanity'

import {SchemaBuild} from '../../telemetry/extractSchema.telemetry.js'
import {CreateWorkspaceManifest} from '../manifest/types.js'
import {type BuildStudioSchemasAndManifestsWorkerData} from './types.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

export type BuildStudioSchemasAndManifestsWorkerSuccess = {
  studioManifest: StudioManifest | null
  type: 'success'
  workspaceManifests: CreateWorkspaceManifest[]
}
type BuildStudioSchemasAndManifestsWorkerError = {
  error: string
  type: 'error'
  validation?: SchemaValidationProblemGroup[]
}
export type BuildStudioSchemasAndManifestsWorkerMessage =
  | BuildStudioSchemasAndManifestsWorkerError
  | BuildStudioSchemasAndManifestsWorkerSuccess

const debug = subdebug('buildStudioSchemasAndManifests')

/**
 * 1. Extracts the create manifest in dist/static (tar/gzipped with studio)
 * 2. Uploads the schema to lexicon
 * 3. Creates a studio manifest (which can be sent to populus)
 */
export async function buildStudioSchemasAndManifests(
  applicationId: string,
  options: BuildStudioSchemasAndManifestsWorkerData,
): Promise<BuildStudioSchemasAndManifestsWorkerSuccess> {
  const {configPath, isExternal, outPath, projectId, verbose, workDir} = options

  const trace = getCliTelemetry().trace(SchemaBuild, {
    // If the studio is externally hosted, we don't need to extract the manifest
    extractManifest: !isExternal,
    manifestDir: outPath,
  })

  try {
    trace.start()
    const result = await studioWorkerTask<BuildStudioSchemasAndManifestsWorkerMessage>(
      new URL('buildStudioSchemasAndManifests.worker.js', import.meta.url),
      {
        applicationId,
        env: {
          ...process.env,
          // Workers don't inherit TTY state — propagate color support from parent
          ...(process.stdout.isTTY && !process.env.NO_COLOR ? {FORCE_COLOR: '1'} : {}),
        },
        name: 'buildStudioSchemasAndManifests',
        studioRootPath: workDir,
        workerData: {
          configPath,
          isExternal,
          outPath,
          projectId,
          verbose,
          workDir,
        } satisfies BuildStudioSchemasAndManifestsWorkerData,
      },
    )

    debug('Result %o', result)

    // If the schema is required, we throw an error
    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    trace.complete()
    return result
  } catch (err) {
    trace.error(err)
    throw err
  }
}
