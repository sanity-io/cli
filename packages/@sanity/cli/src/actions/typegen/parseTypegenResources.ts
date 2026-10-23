import {resolve} from 'node:path'

import {type CliConfig} from '@sanity/cli-core'
import {type TypeGenResource} from '@sanity/cli-core/types'
import {type TypeGenConfig} from '@sanity/codegen'
import {
  array,
  boolean,
  getDotPath,
  isValiError,
  minLength,
  nonEmpty,
  optional,
  parse,
  pipe,
  strictObject,
  string,
  union,
} from 'valibot'

import {parseTypegenConfig} from './parseTypegenConfig.js'

const requiredString = pipe(string(), nonEmpty('Must not be empty'))

const resourcesDefinition = pipe(
  array(
    // Strict, so a misspelled `schema` fails instead of silently fetching the remote schema.
    strictObject({
      dataset: requiredString,
      enforceRequiredFields: optional(boolean()),
      generates: requiredString,
      path: optional(union([string(), array(string())])),
      projectId: requiredString,
      schema: optional(requiredString),
    }),
  ),
  minLength(1, 'List at least one resource, or remove `resources`'),
)

/**
 * Typegen settings for generating types per resource.
 */
export interface TypegenResourcesConfig {
  /** Settings shared by every resource. `schema` and `generates` are unused. */
  config: TypeGenConfig
  resources: TypeGenResource[]
  /** Valid configuration that is likely to produce types that do not compile. */
  warnings: string[]
}

/**
 * The key a resource's types are registered under, matching the SDK runtime.
 */
export function getResourceKey(resource: Pick<TypeGenResource, 'dataset' | 'projectId'>): string {
  return `${resource.projectId}.${resource.dataset}`
}

/**
 * Validates `typegen.resources` and resolves the settings shared by every resource.
 *
 * Returns `undefined` when `resources` is not set, so callers keep the single-schema flow.
 * `overloadClientMethods` defaults to `false` here: with more than one resource the flat query
 * map conflicts across files, and App SDK apps under pnpm cannot resolve `@sanity/client` for it.
 *
 * @param workDir - The project root that `generates` paths are relative to.
 */
export function parseTypegenResources(
  typegen: CliConfig['typegen'],
  workDir: string,
): TypegenResourcesConfig | undefined {
  if (typegen?.resources === undefined) return undefined

  let resources: TypeGenResource[]
  try {
    resources = parse(resourcesDefinition, typegen.resources)
  } catch (error) {
    if (isValiError(error)) {
      const issues = error.issues.map((issue) => {
        const path = getDotPath(issue)
        return `  resources${path ? `.${path}` : ''}: ${issue.message}`
      })
      throw new TypeError(`Error in typegen config\n${issues.join('\n')}`, {cause: error})
    }
    throw error
  }

  const keys = new Set<string>()
  const outputs = new Map<string, string>()
  for (const resource of resources) {
    const key = getResourceKey(resource)
    if (keys.has(key)) {
      throw new TypeError(
        `Error in typegen config\n  resources: "${key}" is listed more than once. Its types are registered under that key, so it can only have one entry.`,
      )
    }
    keys.add(key)

    // Case-insensitive, because two names that differ only in case are the same file on the
    // default macOS and Windows file systems.
    const output = resolve(workDir, resource.generates).toLowerCase()
    const existing = outputs.get(output)
    if (existing) {
      throw new TypeError(
        `Error in typegen config\n  resources: "${existing}" and "${key}" both generate "${resource.generates}". Each resource needs its own output file.`,
      )
    }
    outputs.set(output, key)
  }

  const config = parseTypegenConfig({
    ...typegen,
    overloadClientMethods: typegen.overloadClientMethods ?? false,
  })

  const warnings: string[] = []
  if (config.overloadClientMethods && resources.length > 1) {
    warnings.push(
      'typegen.overloadClientMethods is enabled with more than one resource. Every generated file adds to the same global query map, so a query whose result differs between datasets fails to compile with TS2717.',
    )
  }
  for (const field of ['schema', 'generates'] as const) {
    if (typegen[field] !== undefined) {
      warnings.push(
        `typegen.${field} is not used when typegen.resources is set. Each resource sets its own.`,
      )
    }
  }
  for (const resource of resources) {
    if (resource.enforceRequiredFields !== undefined && resource.schema !== undefined) {
      warnings.push(
        `typegen.resources: enforceRequiredFields has no effect for "${getResourceKey(resource)}", which uses a local schema file. Pass --enforce-required-fields to "sanity schema extract" instead.`,
      )
    }
  }

  return {config, resources, warnings}
}
