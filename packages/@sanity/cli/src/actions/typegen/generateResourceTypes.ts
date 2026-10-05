import {readFile} from 'node:fs/promises'
import {isAbsolute, join} from 'node:path'

import {type TypeGenResource} from '@sanity/cli-core/types'
import {
  type GenerationResult,
  runTypegenGenerate,
  type TypeGenConfig,
  type TypegenProgressEvent,
} from '@sanity/codegen'

import {type ExtractedSchema, fetchResourceSchema} from './fetchResourceSchema.js'
import {getResourceKey} from './parseTypegenResources.js'

/**
 * A resource whose schema has been located, ready to generate.
 */
export type ResolvedResource =
  | {key: string; resource: TypeGenResource; schema: ExtractedSchema; schemaVersion: string}
  | {key: string; resource: TypeGenResource; schemaPath: string}

/**
 * Locates the schema for every resource before anything is generated.
 *
 * A resource with a `schema` path uses that file, which must exist and parse. One without
 * fetches the schema bound to its dataset. Doing this first means a missing binding or a
 * missing or malformed file fails the run before any output is written.
 */
export async function resolveResourceSchemas(options: {
  /** Called once a resource's schema is located. */
  onResolved?: (resolved: ResolvedResource) => void
  /** Called before a resource's schema is located. */
  onResolving?: (resource: TypeGenResource, key: string) => void
  resources: TypeGenResource[]
  workDir: string
}): Promise<ResolvedResource[]> {
  const {onResolved, onResolving, resources, workDir} = options
  const resolved: ResolvedResource[] = []

  for (const resource of resources) {
    const key = getResourceKey(resource)
    onResolving?.(resource, key)
    let entry: ResolvedResource

    if (resource.schema === undefined) {
      try {
        entry = {key, resource, ...(await fetchResourceSchema(resource))}
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to get the schema for "${key}": ${message}`, {cause: error})
      }
    } else {
      const schemaPath = isAbsolute(resource.schema)
        ? resource.schema
        : join(workDir, resource.schema)
      await assertExtractedSchemaFile(schemaPath, {key, schema: resource.schema})
      // Codegen reads the file again, so the generated output names it as its source, as it
      // does without resources.
      entry = {key, resource, schemaPath: resource.schema}
    }

    resolved.push(entry)
    onResolved?.(entry)
  }

  return resolved
}

/**
 * Generates one output file per resource, registering its types under the resource key.
 */
export async function generateResourceTypes(options: {
  /** Settings shared by every resource. */
  config: TypeGenConfig
  /** Returns the progress handler for one resource's generation. */
  onProgress?: (resolved: ResolvedResource) => ((event: TypegenProgressEvent) => void) | undefined
  resolved: ResolvedResource[]
  workDir: string
}): Promise<{key: string; result: GenerationResult}[]> {
  const {config, onProgress, resolved, workDir} = options
  const results: {key: string; result: GenerationResult}[] = []

  for (const entry of resolved) {
    const {dataset, generates, path, projectId} = entry.resource
    let result: GenerationResult
    try {
      result = await runTypegenGenerate({
        config: {
          ...config,
          generates,
          path: path ?? config.path,
          schema: 'schemaPath' in entry ? entry.schemaPath : config.schema,
        },
        extractedSchema: 'schema' in entry ? entry.schema : undefined,
        onProgress: onProgress?.(entry),
        resource: {dataset, projectId},
        workDir,
      })
    } catch (error) {
      // Codegen writes a resource's file once its generation succeeds, so the files of this
      // resource and the ones after it are unchanged. Files of earlier resources are not
      // rolled back.
      const message = error instanceof Error ? error.message : String(error)
      const written = results.map(({key}) => `"${key}"`).join(', ')
      throw new Error(
        `Failed to generate types for "${entry.key}": ${message}` +
          (written
            ? `\nTypes for ${written} were updated. The other output files are unchanged.`
            : ''),
        {cause: error},
      )
    }
    results.push({key: entry.key, result})
  }

  return results
}

/**
 * Checks that a local schema file exists and holds an extracted schema, which is a JSON array.
 */
async function assertExtractedSchemaFile(
  schemaPath: string,
  {key, schema}: {key: string; schema: string},
): Promise<void> {
  let content: string
  try {
    content = await readFile(schemaPath, 'utf8')
  } catch {
    throw new Error(
      `Schema file not found for "${key}": ${schema}. Run "sanity schema extract" to create it.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Schema file for "${key}" is not valid JSON: ${schema}. ${message}`, {
      cause: error,
    })
  }

  if (!Array.isArray(parsed)) {
    throw new TypeError(
      `Schema file for "${key}" is not an extracted schema: ${schema}. Run "sanity schema extract" to recreate it.`,
    )
  }
}
