import {styleText} from 'node:util'

import {
  formatSchemaValidation,
  SchemaDeploy,
  SchemaExtractionError,
} from '@sanity/cli-build/_internal/extract'
import {getCliTelemetry, type Output, studioWorkerTask, subdebug} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type StudioManifest} from 'sanity'

import {deployDebug} from './deployDebug.js'
import {type DeployAppOptions, type DeployStudioSchemasAndManifestsWorkerData} from './types.js'

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
async function deployStudioSchemasAndManifests(
  options: DeployStudioSchemasAndManifestsWorkerData,
  output: Output,
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

    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    trace.complete()
    output.log(
      `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
    )
    return result.studioManifest
  } catch (err) {
    trace.error(err)
    throw err
  }
}

/** The deploy-facing wrapper: extracts and uploads schema + manifest, exiting the deploy on failure. */
export async function uploadStudioSchema(
  options: DeployAppOptions,
  {isExternal}: {isExternal: boolean},
): Promise<StudioManifest | null> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  let studioManifest: StudioManifest | null = null
  try {
    studioManifest = await deployStudioSchemasAndManifests(
      {
        configPath: projectRoot.path,
        isExternal,
        outPath: `${sourceDir}/static`,
        projectId: cliConfig.api?.projectId ?? '',
        schemaRequired: flags['schema-required'],
        verbose: flags.verbose,
        workDir: projectRoot.directory,
      },
      output,
    )
  } catch (error) {
    deployDebug('Error deploying studio schemas and manifests', error)
    if (error instanceof SchemaExtractionError) {
      output.error(formatSchemaValidation(error.validation || []), {exit: 1})
    }
    output.error(`Error deploying studio schemas and manifests: ${error}`, {exit: 1})
  }

  if (!studioManifest) {
    output.error('Failed to generate studio manifest. Please check your schemas and manifests.', {
      exit: 1,
    })
  }

  return studioManifest
}
