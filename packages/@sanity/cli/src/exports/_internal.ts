import {type ManifestSchemaType} from '@sanity/cli-core/schemas'
import {type Schema} from '@sanity/types'

import {loadCliBuild} from '../util/loadCliBuild.js'

export {type CommandTelemetry, defineCommandTelemetry} from '../util/telemetry/commandTelemetry.js'
export {getStudioEnvironmentVariables, type StudioEnvVariablesOptions} from '@sanity/cli-core/env'

/**
 * Extracts the Studio's serializable schema definitions.
 *
 * @internal
 */
export async function extractManifestSchemaTypes(
  schema: Schema,
  workDir: string,
): Promise<ManifestSchemaType[]> {
  const tools = await loadCliBuild('manifest')
  return tools.extractManifestSchemaTypes(schema, workDir)
}
