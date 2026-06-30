import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {SchemaDeploy, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {getCliTelemetry, studioWorkerTask, subdebug} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type StudioManifest} from 'sanity'

import {
  type DeployStudioSchemasAndManifestsWorkerData,
  type WorkspaceSchemaSummary,
} from './types.js'

type DeployStudioSchemasAndManifestsWorkerMessage =
  | {
      error: string
      type: 'error'
      validation?: SchemaValidationProblemGroup[]
    }
  | {
      studioManifest: StudioManifest | null
      type: 'success'
      workspaces: WorkspaceSchemaSummary[]
    }

export interface DeployStudioSchemasAndManifestsResult {
  studioManifest: StudioManifest | null
  workspaces: WorkspaceSchemaSummary[]
}

const debug = subdebug('deployStudioSchemasAndManifests')

/**
 * 1. Extracts the create manifest in dist/static (automatically deployed with studio)
 * 2. Deploys the schemas to /schemas endpoint
 * 3. Creates a studio manifest, uploads it to user application and lexicon
 *
 * With `dryRun`, stops after extraction and validation — nothing is uploaded
 * and no schema-deploy telemetry is recorded.
 */
export async function deployStudioSchemasAndManifests(
  options: DeployStudioSchemasAndManifestsWorkerData,
): Promise<DeployStudioSchemasAndManifestsResult> {
  const {
    configPath,
    dryRun = false,
    isExternal,
    outPath,
    projectId,
    schemaRequired,
    verbose,
    workDir,
  } = options

  const trace = dryRun
    ? null
    : getCliTelemetry().trace(SchemaDeploy, {
        // If the studio is externally hosted, we don't need to extract the manifest
        extractManifest: !isExternal,
        manifestDir: outPath,
        schemaRequired,
      })

  try {
    trace?.start()
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
          dryRun,
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

    trace?.complete()
    if (!dryRun) {
      ux.stdout(
        `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
      )
    }
    return {studioManifest: result.studioManifest, workspaces: result.workspaces}
  } catch (err) {
    trace?.error(err)
    throw err
  }
}
