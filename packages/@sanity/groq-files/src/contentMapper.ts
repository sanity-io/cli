import {createHash} from 'node:crypto'
import {dirname, isAbsolute, resolve, sep} from 'node:path'

import {TypeGenerator} from '@sanity/codegen'

import {evaluateGroqModule} from './evaluateGroqModule.js'
import {
  type JsonRpcConnection,
  JsonRpcError,
  JsonRpcErrorCode,
  type JsonRpcInput,
  type JsonRpcOutput,
  serveJsonRpc,
} from './jsonrpc.js'
import {type LoadedSchema, loadSchemaFile} from './schemaFile.js'

const DIAGNOSTIC_SOURCE = 'sanity-groq'
const DEFAULT_SCHEMA = 'schema.json'
const OPTION_KEYS = new Set(['resources', 'schema'])
const RESOURCE_KEYS = new Set(['path', 'schema'])

const OptionDiagnosticCode = {
  notObject: 1,
  relativePath: 4,
  resourceShape: 6,
  resourcesType: 5,
  schemaType: 3,
  unknown: 2,
} as const

interface OptionDiagnostic {
  code: number
  messageText: string
  path: Array<number | string>
}

/**
 * The `options` object of the `contentMappers` entry in tsconfig.
 *
 * `schema` is the file `sanity schema extract` wrote, relative to the tsconfig, `schema.json`
 * by default. `resources` gives one schema per folder, the way `typegen.resources` in
 * `sanity.cli.ts` gives one per project and dataset: a `.groq` file is typed against the
 * schema of the deepest resource `path` that contains it, and against `schema` otherwise.
 */
interface ContentMapperOptions {
  resources?: ContentMapperResource[]
  schema?: string
}

interface ContentMapperResource {
  /** One or more directories, relative to the tsconfig. */
  path: string | string[]
  /** The schema for `.groq` files under those directories, relative to the tsconfig. */
  schema: string
}

interface ResourceState {
  /** Absolute, normalized directories. Empty for the project-wide fallback. */
  directories: string[]
  generator: TypeGenerator

  loaded?: LoadedSchema
  schemaPath?: string
}

interface ProjectState {
  fallback: ResourceState
  resources: ResourceState[]

  /** Directory of the tsconfig. Absent for an inferred project (`configFileName === ""`). */
  root?: string
}

const projects = new Map<string, ProjectState>()

/**
 * Serves TypeScript 7.1's content mapper protocol over the given streams:
 * `initialize`, `openProject`, `transform`, and `closeProject`.
 * https://github.com/microsoft/typescript-go/pull/4712
 */
export function startContentMapper(options: {
  input: JsonRpcInput
  output: JsonRpcOutput
}): JsonRpcConnection {
  return serveJsonRpc({
    handle: (request) => handleContentMapperRequest(request.method, request.params),
    input: options.input,
    output: options.output,
  })
}

export async function handleContentMapperRequest(
  method: string,
  params: unknown,
): Promise<unknown> {
  switch (method) {
    case 'closeProject': {
      return closeProject(params)
    }
    case 'initialize': {
      return initialize(params)
    }
    case 'openProject': {
      return openProject(params)
    }
    case 'transform': {
      return transform(params)
    }
    default: {
      throw new JsonRpcError(JsonRpcErrorCode.methodNotFound, `Unknown method "${method}".`)
    }
  }
}

function initialize(params: unknown): {diagnosticSource: string; positionEncoding: 'utf-16'} {
  const encodings = record(params)?.positionEncodings
  if (!Array.isArray(encodings) || !encodings.includes('utf-16')) {
    throw new JsonRpcError(
      JsonRpcErrorCode.invalidParams,
      'This mapper reports positions in utf-16, which the host did not offer.',
    )
  }
  return {diagnosticSource: DIAGNOSTIC_SOURCE, positionEncoding: 'utf-16'}
}

async function openProject(params: unknown): Promise<{
  configIdentity: string
  optionDiagnostics?: OptionDiagnostic[]
  watchedFiles: string[]
}> {
  const body = record(params)
  if (!body || typeof body.projectHandle !== 'string' || typeof body.configFileName !== 'string') {
    throw new JsonRpcError(
      JsonRpcErrorCode.invalidParams,
      'openProject requires projectHandle and configFileName strings.',
    )
  }
  const {configFileName, projectHandle} = body
  const {optionDiagnostics, options} = readOptions(body.options)

  // The protocol sends "" for a project without a tsconfig. The host starts this
  // process inside the installed package, so cwd is never a useful fallback.
  const root = configFileName.length > 0 ? dirname(configFileName) : undefined
  const locate = (
    value: string | undefined,
    label: 'path' | 'schema',
    at: Array<number | string>,
  ): string | undefined => {
    if (root !== undefined) return resolve(root, value ?? DEFAULT_SCHEMA)
    if (value !== undefined && isAbsolute(value)) return value
    optionDiagnostics.push({
      code: OptionDiagnosticCode.relativePath,
      messageText: `Without a tsconfig.json, ${label} must be an absolute path.`,
      path: value === undefined ? at.slice(0, -1) : at,
    })
    return undefined
  }

  const fallback = await loadResource([], locate(options.schema, 'schema', ['schema']))
  const resources: ResourceState[] = []
  for (const [index, resource] of (options.resources ?? []).entries()) {
    const directories = (Array.isArray(resource.path) ? resource.path : [resource.path])
      .map((path, position) =>
        locate(
          path,
          'path',
          Array.isArray(resource.path)
            ? ['resources', index, 'path', position]
            : ['resources', index, 'path'],
        ),
      )
      .filter((directory) => directory !== undefined)
      .map((directory) => normalizeDirectory(directory))
    const schemaPath = locate(resource.schema, 'schema', ['resources', index, 'schema'])
    if (directories.length === 0 || schemaPath === undefined) continue
    resources.push(await loadResource(directories, schemaPath))
  }

  projects.set(projectHandle, {fallback, resources, root})

  const all = [fallback, ...resources]
  const identity = createHash('sha256')
  for (const resource of all) {
    identity.update(`${resource.schemaPath ?? ''}\0`)
    identity.update(resource.loaded?.bytes ?? 'missing')
    identity.update('\0')
  }
  return {
    configIdentity: identity.digest('hex'),
    ...(optionDiagnostics.length > 0 ? {optionDiagnostics} : {}),
    watchedFiles: [
      ...new Set(all.map((resource) => resource.schemaPath).filter((path) => path !== undefined)),
    ],
  }
}

async function loadResource(
  directories: string[],
  schemaPath: string | undefined,
): Promise<ResourceState> {
  return {
    directories,
    generator: new TypeGenerator(),
    loaded: schemaPath === undefined ? undefined : await loadSchemaFile(schemaPath),
    schemaPath,
  }
}

function readOptions(input: unknown): {
  optionDiagnostics: OptionDiagnostic[]
  options: ContentMapperOptions
} {
  const optionDiagnostics: OptionDiagnostic[] = []
  const options: ContentMapperOptions = {}
  if (input === undefined) return {optionDiagnostics, options}
  if (!isRecord(input)) {
    optionDiagnostics.push({
      code: OptionDiagnosticCode.notObject,
      messageText: 'options must be an object.',
      path: [],
    })
    return {optionDiagnostics, options}
  }
  for (const key of Object.keys(input)) {
    if (OPTION_KEYS.has(key)) continue
    optionDiagnostics.push({
      code: OptionDiagnosticCode.unknown,
      messageText: `Unknown option "${key}". The options are "schema" and "resources".`,
      path: [key],
    })
  }

  if (input.schema !== undefined) {
    if (typeof input.schema === 'string') {
      options.schema = input.schema
    } else {
      optionDiagnostics.push({
        code: OptionDiagnosticCode.schemaType,
        messageText: 'schema must be a path string.',
        path: ['schema'],
      })
    }
  }

  if (input.resources !== undefined) {
    if (Array.isArray(input.resources)) {
      options.resources = input.resources
        .map((resource, index) => readResource(resource, index, optionDiagnostics))
        .filter((resource) => resource !== undefined)
    } else {
      optionDiagnostics.push({
        code: OptionDiagnosticCode.resourcesType,
        messageText: 'resources must be an array of {path, schema} objects.',
        path: ['resources'],
      })
    }
  }
  return {optionDiagnostics, options}
}

function readResource(
  input: unknown,
  index: number,
  optionDiagnostics: OptionDiagnostic[],
): ContentMapperResource | undefined {
  const fail = (messageText: string, path: Array<number | string>): undefined => {
    optionDiagnostics.push({code: OptionDiagnosticCode.resourceShape, messageText, path})
    return undefined
  }
  if (!isRecord(input)) {
    return fail('Each resource must be a {path, schema} object.', ['resources', index])
  }
  for (const key of Object.keys(input)) {
    if (RESOURCE_KEYS.has(key)) continue
    optionDiagnostics.push({
      code: OptionDiagnosticCode.unknown,
      messageText: `Unknown resource option "${key}". A resource has "path" and "schema".`,
      path: ['resources', index, key],
    })
  }
  const {path, schema} = input
  if (!isResourcePath(path)) {
    return fail('A resource path must be a directory string or a non-empty array of them.', [
      'resources',
      index,
      'path',
    ])
  }
  if (typeof schema !== 'string') {
    return fail('A resource schema must be a path string.', ['resources', index, 'schema'])
  }
  return {path, schema}
}

function isResourcePath(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string'))
  )
}

async function transform(params: unknown): Promise<{
  diagnostics?: Array<{code: number; length: number; messageText: string; start: number}>
  extension: '.ts'
  text: string
}> {
  const body = record(params)
  const projectHandle = body?.projectHandle
  const content = body?.content
  const fileName = body?.fileName
  if (
    typeof projectHandle !== 'string' ||
    typeof content !== 'string' ||
    typeof fileName !== 'string'
  ) {
    throw new JsonRpcError(
      JsonRpcErrorCode.invalidParams,
      'transform requires projectHandle, fileName, and content strings.',
    )
  }
  const project = projects.get(projectHandle)
  if (!project) {
    throw new JsonRpcError(JsonRpcErrorCode.invalidParams, `Unknown project "${projectHandle}".`)
  }

  const resource = resourceFor(project, fileName)
  const evaluated = await evaluateGroqModule({
    content,
    filename: fileName,
    generator: resource.generator,
    root: project.root ?? dirname(fileName),
    schema: resource.loaded?.schema,
    schemaNote: schemaNote(project, resource),
    schemaPath: resource.schemaPath,
  })

  return {
    ...(evaluated.diagnostics.length > 0 ? {diagnostics: evaluated.diagnostics} : {}),
    extension: '.ts',
    text: evaluated.text,
  }
}

/** The resource whose deepest directory contains the file, or the project-wide fallback. */
function resourceFor(project: ProjectState, fileName: string): ResourceState {
  const file = normalizePath(fileName)
  let best = project.fallback
  let bestLength = -1
  for (const resource of project.resources) {
    for (const directory of resource.directories) {
      if (directory.length > bestLength && file.startsWith(`${directory}/`)) {
        best = resource
        bestLength = directory.length
      }
    }
  }
  return best
}

function schemaNote(project: ProjectState, resource: ResourceState): string | undefined {
  if (resource.schemaPath === undefined) {
    return 'No schema configured. Set the content mapper option "schema" to the file written by "sanity schema extract".'
  }
  const note = resource.loaded?.note
  if (note === undefined) return undefined
  return resource === project.fallback && project.resources.length > 0
    ? `This file is outside every "resources" path. ${note}`
    : note
}

function closeProject(params: unknown): Record<string, never> {
  const projectHandle = record(params)?.projectHandle
  if (typeof projectHandle !== 'string') {
    throw new JsonRpcError(
      JsonRpcErrorCode.invalidParams,
      'closeProject requires a projectHandle string.',
    )
  }
  projects.delete(projectHandle)
  return {}
}

function normalizeDirectory(directory: string): string {
  return normalizePath(directory).replace(/\/+$/, '')
}

/** Forward slashes, and case-folded where the file system is, so host and tsconfig paths compare. */
function normalizePath(path: string): string {
  const resolved = resolve(path).replaceAll(sep, '/')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
