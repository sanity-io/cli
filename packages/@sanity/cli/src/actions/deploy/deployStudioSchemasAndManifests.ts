import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {getCliTelemetry, studioWorkerTask, subdebug} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'

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
): Promise<void> {
  const {configPath, isExternal, outPath, schemaRequired, verbose, workDir} = options

  const trace = getCliTelemetry().trace(SchemaDeploy, {
    // If the studio is externally hosted, we don't need to extract the manifest
    extractManifest: !isExternal,
    manifestDir: outPath,
    schemaRequired,
    // Deploy command does not take these flags this is leftover from the shared code
    tag: undefined,
    workspaceName: undefined,
  })

  try {
    trace.start()
    const result = await studioWorkerTask<DeployStudioSchemasAndManifestsWorkerMessage>(
      new URL('deployStudioSchemasAndManifests.worker.js', import.meta.url),
      {
        name: 'deployStudioSchemasAndManifests',
        studioRootPath: workDir,
        workerData: {
          configPath,
          isExternal,
          outPath,
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
  } catch (err) {
    trace.error(err)
    if (schemaRequired) {
      throw err
    } else {
      ux.stdout(`↳ Error when storing schemas:\n  ${err.message}`)
    }
  } finally {
    ux.stdout(
      `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
    )
  }
}
