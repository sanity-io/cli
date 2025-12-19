import {isMainThread, type MessagePort, parentPort, workerData} from 'node:worker_threads'

import {type Schema} from '@sanity/types'
import {isPlainObject} from 'lodash-es'
import {oneline} from 'oneline'

import {
  type GraphQLAPIConfig,
  type SchemaDefinitionish,
  type TypeResolvedGraphQLAPI,
} from './types.js'

interface Source {
  dataset: string
  name: string
  projectId: string
  schema: Schema
}

interface Workspace extends Source {
  unstable_sources: Source[]
}

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  await getGraphQLAPIsForked(parentPort).then(() => process.exit())
}

await main()

async function getGraphQLAPIsForked(parent: MessagePort): Promise<void> {
  const {cliConfig, workspaces} = workerData
  const resolved = await resolveGraphQLApis({cliConfig, workspaces})
  parent.postMessage(resolved)
}

interface ResolveGraphQLApisOptions {
  workspaces: Workspace[]

  cliConfig?: {graphql?: GraphQLAPIConfig[]}
}

async function resolveGraphQLApis({
  cliConfig,
  workspaces,
}: ResolveGraphQLApisOptions): Promise<TypeResolvedGraphQLAPI[]> {
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

  // Explicity defined config
  const apiDefs = validateCliConfig(cliConfig?.graphql || [])
  return resolveGraphQLAPIsFromConfig(apiDefs, workspaces)
}

function resolveGraphQLAPIsFromConfig(
  apiDefs: GraphQLAPIConfig[],
  workspaces: Workspace[],
): TypeResolvedGraphQLAPI[] {
  const resolvedApis: TypeResolvedGraphQLAPI[] = []

  for (const apiDef of apiDefs) {
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

    // If we only have a single source defined, we can assume that is the intended one,
    // even if no `source` is defined for the GraphQL API
    const source =
      !sourceName && workspace.unstable_sources.length === 1
        ? workspace.unstable_sources[0]
        : workspace.unstable_sources.find((src) => src.name === (sourceName || 'default'))

    if (!source) {
      throw new Error(
        `Source "${sourceName || 'default'}" not found in workspace "${
          workspaceName || 'default'
        }"`,
      )
    }

    resolvedApis.push({
      ...apiDef,
      dataset: source.dataset,
      projectId: source.projectId,
      schemaTypes: getStrippedSchemaTypes(source.schema),
    })
  }

  return resolvedApis
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
