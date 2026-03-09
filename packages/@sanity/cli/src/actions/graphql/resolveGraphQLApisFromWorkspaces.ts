import {type Schema} from '@sanity/types'
import isPlainObject from 'lodash-es/isPlainObject.js'
import {oneline} from 'oneline'

import {
  type ExtractedGraphQLAPI,
  type GraphQLAPIConfig,
  type SchemaDefinitionish,
  type TypeResolvedGraphQLAPI,
} from './types.js'

export interface Source {
  dataset: string
  name: string
  projectId: string
  schema: Schema
}

export interface Workspace extends Source {
  unstable_sources: Source[]
}

/**
 * Minimal source metadata — dataset/projectId pair for a source within a workspace.
 */
export interface SourceMetadata {
  dataset: string
  name: string
  projectId: string
}

/**
 * Minimal workspace metadata — enough for resolving API identifiers without compiling schemas.
 * This matches the raw workspace shape from `defineConfig()` before `resolveConfig()` processes it.
 *
 * The `sources` array mirrors `Workspace.unstable_sources` from the full resolved config.
 * When the raw config includes `unstable_sources`, they are extracted here. Otherwise, the
 * workspace itself is used as a single default source (matching what `resolveConfig()` would do).
 */
export interface WorkspaceMetadata {
  dataset: string
  name: string
  projectId: string
  sources: SourceMetadata[]
}

interface ResolveGraphQLApisOptions {
  workspaces: Workspace[]

  cliConfig?: {graphql?: GraphQLAPIConfig[]}
}

export function resolveGraphQLApis({
  cliConfig,
  workspaces,
}: ResolveGraphQLApisOptions): TypeResolvedGraphQLAPI[] {
  const numSources = workspaces.reduce(
    (count, workspace) => count + workspace.unstable_sources.length,
    0,
  )
  const multiSource = numSources > 1
  const multiWorkspace = workspaces.length > 1
  const hasGraphQLConfig = Boolean(cliConfig?.graphql)

  if (workspaces.length === 0) {
    throw new Error('No studio configuration found')
  }

  if (numSources === 0) {
    throw new Error('No sources (project ID / dataset) configured')
  }

  // We can only automatically configure if there is a single workspace + source in play
  if ((multiWorkspace || multiSource) && !hasGraphQLConfig) {
    throw new Error(oneline`
      Multiple workspaces/sources configured.
      You must define an array of GraphQL APIs in \`sanity.cli.ts\` or \`sanity.cli.js\`
      and specify which workspace/source to use.
    `)
  }

  // No config is defined, but we have a single workspace + source, so use that
  if (!hasGraphQLConfig) {
    const {dataset, projectId, schema} = workspaces[0].unstable_sources[0]
    return [{dataset, projectId, schemaTypes: getStrippedSchemaTypes(schema)}]
  }

  // Explicitly defined config
  const apiDefs = validateCliConfig(cliConfig?.graphql || [])
  return resolveGraphQLAPIsFromConfig(apiDefs, workspaces)
}

/**
 * Resolve GraphQL API metadata (projectId, dataset, tag, etc.) from raw workspace configs
 * without compiling schemas. This is used when we only need API identifiers, not schema types —
 * e.g. for `graphql undeploy --api` or `graphql list`.
 */
export function resolveGraphQLApiMetadata({
  cliConfig,
  workspaces,
}: {
  cliConfig?: {graphql?: GraphQLAPIConfig[]}
  workspaces: WorkspaceMetadata[]
}): ExtractedGraphQLAPI[] {
  const numSources = workspaces.reduce((count, ws) => count + ws.sources.length, 0)
  const multiSource = numSources > 1
  const multiWorkspace = workspaces.length > 1
  const hasGraphQLConfig = Boolean(cliConfig?.graphql)

  if (workspaces.length === 0) {
    throw new Error('No studio configuration found')
  }

  if (numSources === 0) {
    throw new Error('No sources (project ID / dataset) configured')
  }

  // We can only automatically configure if there is a single workspace + source in play
  if ((multiWorkspace || multiSource) && !hasGraphQLConfig) {
    throw new Error(oneline`
      Multiple workspaces/sources configured.
      You must define an array of GraphQL APIs in \`sanity.cli.ts\` or \`sanity.cli.js\`
      and specify which workspace/source to use.
    `)
  }

  // Validate that workspaces and their sources have non-empty projectId/dataset.
  // The worker's toWorkspaceMetadata validates this before constructing metadata,
  // but assert here to make the invariant explicit.
  for (const ws of workspaces) {
    if (!ws.projectId || !ws.dataset) {
      throw new Error(
        `Workspace "${ws.name}" is missing a projectId or dataset. ` +
          'Check your studio configuration.',
      )
    }
    for (const source of ws.sources) {
      if (!source.projectId || !source.dataset) {
        throw new Error(
          `Source "${source.name}" in workspace "${ws.name}" is missing a projectId or dataset. ` +
            'Check your studio configuration.',
        )
      }
    }
  }

  // No config is defined, but we have a single workspace + source, so use that
  if (!hasGraphQLConfig) {
    const {dataset, projectId} = workspaces[0].sources[0]
    return [{dataset, projectId}]
  }

  // Explicitly defined config
  const apiDefs = validateCliConfig(cliConfig?.graphql || [])
  return resolveGraphQLApiMetadataFromConfig(apiDefs, workspaces)
}

/**
 * Shared workspace/source resolution logic for both the metadata and full-compile paths.
 *
 * Both `resolveGraphQLAPIsFromConfig` and `resolveGraphQLApiMetadataFromConfig` need to
 * resolve the workspace and source for each GraphQL API config entry. This helper
 * extracts that shared logic so bug fixes and edge-case handling apply to both paths.
 */
function resolveWorkspaceAndSource<
  TWorkspace extends {name: string},
  TSource extends {name: string},
>(
  apiDef: GraphQLAPIConfig,
  workspaces: TWorkspace[],
  getSources: (workspace: TWorkspace) => TSource[],
): {source: TSource; workspace: TWorkspace} {
  const {source: sourceName, workspace: workspaceName} = apiDef

  if (!workspaceName && workspaces.length > 1) {
    throw new Error(
      'Must define `workspace` name in GraphQL API config when multiple workspaces are defined',
    )
  }

  // If we only have a single workspace defined, we can assume that is the intended one,
  // even if no `workspace` is defined for the GraphQL API
  const workspace =
    !workspaceName && workspaces.length === 1
      ? workspaces[0]
      : workspaces.find((space) => space.name === (workspaceName || 'default'))

  if (!workspace) {
    throw new Error(`Workspace "${workspaceName || 'default'}" not found`)
  }

  const sources = getSources(workspace)

  // If we only have a single source defined, we can assume that is the intended one,
  // even if no `source` is defined for the GraphQL API
  const source =
    !sourceName && sources.length === 1
      ? sources[0]
      : sources.find((src) => src.name === (sourceName || 'default'))

  if (!source) {
    throw new Error(
      `Source "${sourceName || 'default'}" not found in workspace "${workspaceName || 'default'}"`,
    )
  }

  return {source, workspace}
}

function resolveGraphQLApiMetadataFromConfig(
  apiDefs: GraphQLAPIConfig[],
  workspaces: WorkspaceMetadata[],
): ExtractedGraphQLAPI[] {
  return apiDefs.map((apiDef) => {
    const {source} = resolveWorkspaceAndSource(apiDef, workspaces, (ws) => ws.sources)

    return {
      dataset: source.dataset,
      filterSuffix: apiDef.filterSuffix,
      generation: apiDef.generation,
      id: apiDef.id,
      nonNullDocumentFields: apiDef.nonNullDocumentFields,
      playground: apiDef.playground,
      projectId: source.projectId,
      tag: apiDef.tag,
    }
  })
}

function resolveGraphQLAPIsFromConfig(
  apiDefs: GraphQLAPIConfig[],
  workspaces: Workspace[],
): TypeResolvedGraphQLAPI[] {
  return apiDefs.map((apiDef) => {
    const {source} = resolveWorkspaceAndSource(apiDef, workspaces, (ws) => ws.unstable_sources)

    return {
      ...apiDef,
      dataset: source.dataset,
      projectId: source.projectId,
      schemaTypes: getStrippedSchemaTypes(source.schema),
    }
  })
}

function validateCliConfig(
  config: GraphQLAPIConfig[],
  configPath = 'sanity.cli.js',
): GraphQLAPIConfig[] {
  if (!Array.isArray(config)) {
    throw new TypeError(`"graphql" key in "${configPath}" must be an array if defined`)
  }

  if (config.length === 0) {
    throw new Error(`No GraphQL APIs defined in "${configPath}"`)
  }

  return config
}

function getStrippedSchemaTypes(schema: Schema): SchemaDefinitionish[] {
  const schemaDef = schema._original || {types: []}
  return schemaDef.types.map((type) => stripType(type))
}

function stripType(input: unknown): SchemaDefinitionish {
  return strip(input) as SchemaDefinitionish
}

function strip(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => strip(item)).filter((item) => item !== undefined)
  }

  if (isPlainishObject(input)) {
    const stripped: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      stripped[key] = strip(input[key])
    }
    return stripped
  }

  return isBasicType(input) ? input : undefined
}

function isPlainishObject(input: unknown): input is Record<string, unknown> {
  return isPlainObject(input)
}

function isBasicType(input: unknown): boolean {
  const type = typeof input
  if (type === 'boolean' || type === 'number' || type === 'string') {
    return true
  }

  if (type !== 'object') {
    return false
  }

  return Array.isArray(input) || input === null || isPlainishObject(input)
}
