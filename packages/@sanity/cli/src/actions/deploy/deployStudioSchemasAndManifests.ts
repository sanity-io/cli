import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {getCliTelemetry, studioWorkerTask, subdebug} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type StudioManifest} from 'sanity'

import {SchemaDeploy} from '../../telemetry/extractSchema.telemetry.js'
import {SchemaExtractionError} from '../schema/utils/SchemaExtractionError.js'
import {type DeployStudioSchemasAndManifestsWorkerData} from './types.js'

type DeployStudioSchemasAndManifestsWorkerMessage =
  | {
      error: string
      type: 'error'
      validation?: SchemaValidationProblemGroup[]
    }
  | {
      studioManifest: StudioManifest | null
      type: 'success'
    }

const debug = subdebug('deployStudioSchemasAndManifests')

/**
 * 1. Extracts the create manifest in dist/static (automatically deployed with studio)
 * 2. Deploys the schemas to /schemas endpoint
 * 3. Creates a studio manifest, uploads it to user application and lexicon
 */
export async function deployStudioSchemasAndManifests(
  options: DeployStudioSchemasAndManifestsWorkerData,
): Promise<StudioManifest | null> {
  const {configPath, isExternal, outPath, projectId, schemaRequired, verbose, workDir} = options

  const trace = getCliTelemetry().trace(SchemaDeploy, {
    // If the studio is externally hosted, we don't need to extract the manifest
    extractManifest: !isExternal,
    manifestDir: outPath,
    schemaRequired,
  })

  try {
    trace.start()
    const result = await studioWorkerTask<DeployStudioSchemasAndManifestsWorkerMessage>(
      new URL('deployStudioSchemasAndManifests.worker.js', import.meta.url),
      {
        env: {
          ...process.env,
          // Workers don't inherit TTY state — propagate color support from parent
          ...(process.stdout.isTTY && !process.env.NO_COLOR ? {FORCE_COLOR: '1'} : {}),
        },
        name: 'deployStudioSchemasAndManifests',
        studioRootPath: workDir,
        workerData: {
          configPath,
          isExternal,
          outPath,
          projectId,
          schemaRequired,
          verbose,
          workDir,
        } satisfies DeployStudioSchemasAndManifestsWorkerData,
      },
    )

    debug('Result %o', result)

    // If the schema is required, we throw an error
    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    trace.complete()
    ux.stdout(
      `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
    )
    return result.studioManifest
  } catch (err) {
    trace.error(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
