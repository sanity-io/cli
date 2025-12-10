import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {isMainThread, Worker} from 'node:worker_threads'

import {getCliConfig, getStudioConfig} from '@sanity/cli-core'
import {packageDirectory} from 'pkg-dir'
import {createSchema} from 'sanity'

import {
  type ResolvedGraphQLAPI,
  type ResolvedSourceProperties,
  type SchemaDefinitionish,
  type TypeResolvedGraphQLAPI,
} from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function getGraphQLAPIs(workDir: string): Promise<ResolvedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('getGraphQLAPIs() must be called from the main thread')
  }

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

  const cliPkgDir = await packageDirectory({cwd: __dirname})
  if (!cliPkgDir) {
    throw new Error('Unable to resolve @sanity/cli module root')
  }

  const configPath = path.join(workDir, 'sanity.cli.ts')

  const workerPath = path.join(cliPkgDir, 'dist', 'threads', 'getGraphQLAPIs.js')

  return new Promise<TypeResolvedGraphQLAPI[]>((resolve, reject) => {
    const worker = new Worker(workerPath, {
      env: process.env,
      workerData: {
        cliConfig: serialize(cliConfig),
        cliConfigPath: configPath,
        workDir,
        workspaces: serialize(workspaces),
      },
    })
    worker.on('message', resolve)
    worker.on('error', (error) => {
      worker.terminate()
      reject(error)
  })
    worker.on('exit', (code) => {
      if (code !== 0) {
        worker.terminate()
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })
}

function serialize<T>(obj: T): T {
  try {
    return structuredClone(obj)
  } catch (cause) {
    throw new Error(`Failed to serialize CLI configuration`, {cause})
  }
}
