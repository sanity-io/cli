import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

import {type ContextOpenApiDocument} from './distillContextOperations.js'

/**
 * The Context API's OpenAPI spec as vendored by the installed `@sanity/client`,
 * the same spec its `client.context.request` types come from
 */
export function readContextSpec(): ContextOpenApiDocument {
  const clientRoot = dirname(createRequire(import.meta.url).resolve('@sanity/client/package.json'))
  return JSON.parse(readFileSync(join(clientRoot, 'src/context/openapi.json'), 'utf8'))
}

/** Where a command's file lives, relative to the package root: `context sources list` → `src/commands/context/sources/list.ts` */
export function commandFilePath(commandId: string): string {
  return `src/commands/${commandId.split(' ').join('/')}.ts`
}

/** The exported class name of an operation's command: `listSources` → `ListSourcesCommand` */
export function commandClassName(operationId: string): string {
  return `${operationId[0].toUpperCase()}${operationId.slice(1)}Command`
}
