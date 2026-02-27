import {isMainThread} from 'node:worker_threads'

import {
  type CliConfig,
  getCliConfig,
  getStudioConfig,
  promisifyWorker,
  resolveLocalPackage,
} from '@sanity/cli-core'

import {
  type ResolvedGraphQLAPI,
  type ResolvedSourceProperties,
  type SchemaDefinitionish,
  type TypeResolvedGraphQLAPI,
} from './types.js'

export async function getGraphQLAPIs(workDir: string): Promise<ResolvedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('getGraphQLAPIs() must be called from the main thread')
  }

  // Resolve `sanity` local to the project in order to avoid using incompatible versions, and to avoid circular dependencies
  const {createSchema} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  const defaultSchema = createSchema({name: 'default', types: []})
  const defaultTypes = defaultSchema.getTypeNames()
  const isCustomType = (type: SchemaDefinitionish) => !defaultTypes.includes(type.name)

  const apis = await getApisWithSchemaTypes(workDir)
  const resolved = apis.map(
    ({schemaTypes, ...api}): ResolvedSourceProperties => ({
      schema: createSchema({
        name: 'default',
        types: schemaTypes.filter((element) => isCustomType(element)),
      }),
      ...api,
    }),
  )

  return resolved
}

async function getApisWithSchemaTypes(workDir: string): Promise<TypeResolvedGraphQLAPI[]> {
  const cliConfig = await getCliConfig(workDir)
  const workspaces = await getStudioConfig(workDir, {resolvePlugins: true})

  return promisifyWorker<TypeResolvedGraphQLAPI[]>(
    new URL('getGraphQLAPIs.worker.js', import.meta.url),
    {
      env: process.env,
      workerData: {
        cliConfig: extractGraphQLConfig(cliConfig),
        workDir,
        workspaces,
      },
    },
  )
}

function extractGraphQLConfig(config: CliConfig) {
  return structuredClone({
    api: config.api,
    graphql: config.graphql,
  })
}
