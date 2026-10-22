import {
  type EvaluatedModule,
  type ExtractedModule,
  type ExtractedQuery,
  TypeGenerator,
  type TypegenWorkerChannel,
} from '@sanity/codegen'
import {type WorkerChannelMessage, WorkerChannelReporter} from '@sanity/worker-channels'
import {type SchemaType} from 'groq-js'

import {type GroqParam, inferGroqParams, syntaxDiagnostic} from './params.js'
import {sliceQuery} from './runtime.js'
import {
  collectTypeReferences,
  type GeneratedTypeAlias,
  renderVirtualModule,
} from './virtualModule.js'

const EVALUATION_FAILED = 'Could not type this GROQ query against the schema.'

const GroqDiagnosticCode = {
  empty: 1,
  evaluation: 4,
  schema: 3,
  syntax: 2,
} as const

interface GroqDiagnostic {
  code: number
  length: number
  messageText: string
  start: number
}

export interface EvaluatedGroqModule {
  diagnostics: GroqDiagnostic[]
  params: GroqParam[]
  query: string
  text: string
}

export interface EvaluateGroqModuleOptions {
  content: string
  filename: string

  generator?: TypeGenerator
  root?: string
  schema?: SchemaType
  schemaNote?: string
  schemaPath?: string
}

type SchemaTypesPayload = Parameters<
  WorkerChannelReporter<TypegenWorkerChannel>['event']['generatedSchemaTypes']
>[0]

interface TypegenOutput {
  module?: EvaluatedModule
  schemaTypes?: SchemaTypesPayload
}

export async function evaluateGroqModule(
  options: EvaluateGroqModuleOptions,
): Promise<EvaluatedGroqModule> {
  const {offset, query} = sliceQuery(options.content)
  if (query.length === 0) {
    return finish({
      content: options.content,
      diagnostics: [
        diagnostic(
          0,
          options.content.length,
          'This .groq file is empty.',
          GroqDiagnosticCode.empty,
        ),
      ],
      params: [],
      query: '',
    })
  }

  const inference = inferGroqParams(query, options.schema ?? [])
  if (!inference.ok) {
    const syntax = syntaxDiagnostic(inference.error)
    return finish({
      content: options.content,
      diagnostics: [
        diagnostic(offset + syntax.position, 1, syntax.message, GroqDiagnosticCode.syntax),
      ],
      params: [],
      query,
    })
  }

  const notes = options.schemaNote ? [options.schemaNote] : []
  const diagnostics = options.schemaNote
    ? [diagnostic(offset, Math.min(1, query.length), options.schemaNote, GroqDiagnosticCode.schema)]
    : []

  if (!options.schema) {
    return finish({
      content: options.content,
      diagnostics,
      notes,
      params: inference.params,
      query,
    })
  }

  let output: TypegenOutput = {}
  let failure: string | undefined
  try {
    output = await runTypegen(options, options.schema, query)
  } catch (error) {
    failure = error instanceof Error ? error.message : EVALUATION_FAILED
  }
  failure ??= output.module?.errors[0]?.message
  const result = output.module?.queries[0]
  if (!result || failure !== undefined || !output.schemaTypes) {
    const message = failure ?? EVALUATION_FAILED
    diagnostics.push(
      diagnostic(offset, Math.min(1, query.length), message, GroqDiagnosticCode.evaluation),
    )
    return finish({
      content: options.content,
      diagnostics,
      notes: [...notes, message],
      params: inference.params,
      query,
    })
  }

  const {allSanitySchemaTypesDeclaration, schemaTypeDeclarations} = output.schemaTypes
  const schemaTypes: GeneratedTypeAlias[] = schemaTypeDeclarations.map((declaration) => ({
    code: declaration.code,
    name: declaration.id.name,
    references: collectTypeReferences(declaration.tsType),
  }))
  schemaTypes.push({
    code: allSanitySchemaTypesDeclaration.code,
    name: allSanitySchemaTypesDeclaration.id.name,
    references: new Set(schemaTypeDeclarations.map((declaration) => declaration.id.name)),
  })

  return finish({
    content: options.content,
    diagnostics,
    notes,
    params: inference.params,
    query,
    result: {
      code: result.code,
      name: result.id.name,
      references: collectTypeReferences(result.tsType),
    },
    schemaTypes,
  })
}

export function variableNameFromFilename(filename: string): string {
  const base = filename.replaceAll('\\', '/').split('/').pop() ?? 'query'
  const stem = base.replace(/\.groq$/i, '')
  const camel = stem.replaceAll(/[^A-Za-z0-9]+([A-Za-z0-9])?/g, (_, char: string | undefined) =>
    char ? char.toUpperCase() : '',
  )
  const cleaned = camel.replace(/^\d/, (digit) => `_${digit}`)
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned) ? cleaned : 'query'
}

async function runTypegen(
  options: EvaluateGroqModuleOptions,
  schema: SchemaType,
  query: string,
): Promise<TypegenOutput> {
  const output: TypegenOutput = {}
  const reporter = new WorkerChannelReporter<TypegenWorkerChannel>((message) =>
    collect(output, message),
  )
  const generator = options.generator ?? new TypeGenerator()
  await generator.generateTypes({
    overloadClientMethods: false,
    queries: oneQuery(options.filename, query, variableNameFromFilename(options.filename)),
    reporter,
    root: options.root,
    schema,
    schemaPath: options.schemaPath,
  })
  return output
}

function collect(output: TypegenOutput, message: WorkerChannelMessage): void {
  if (message.type === 'channel-event' && message.name === 'generatedSchemaTypes') {
    output.schemaTypes = message.payload as SchemaTypesPayload
  }
  if (message.type === 'channel-emission' && message.name === 'evaluatedModules') {
    output.module ??= message.payload as EvaluatedModule
  }
}

function finish(options: {
  content: string
  diagnostics: GroqDiagnostic[]
  notes?: string[]
  params: GroqParam[]
  query: string
  result?: GeneratedTypeAlias
  schemaTypes?: GeneratedTypeAlias[]
}): EvaluatedGroqModule {
  return {
    diagnostics: options.diagnostics.map((item) => clamp(item, options.content.length)),
    params: options.params,
    query: options.query,
    text: renderVirtualModule({
      diagnostics: options.notes,
      params: options.params,
      query: options.query,
      result: options.result,
      schemaTypes: options.schemaTypes,
    }),
  }
}

function diagnostic(
  start: number,
  length: number,
  messageText: string,
  code: number,
): GroqDiagnostic {
  return {code, length, messageText, start}
}

function clamp(item: GroqDiagnostic, length: number): GroqDiagnostic {
  const start = Math.min(Math.max(item.start, 0), length)
  const span = Math.min(Math.max(item.length, 0), length - start)
  return {...item, length: span, start}
}

function oneQuery(filename: string, query: string, name: string): AsyncIterable<ExtractedModule> {
  const variable: ExtractedQuery['variable'] = {
    id: {name, type: 'Identifier'} as ExtractedQuery['variable']['id'],
  }
  return (async function* modules() {
    yield {errors: [], filename, queries: [{filename, query, variable}]}
  })()
}
