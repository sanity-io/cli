import {type TelemetryEvent} from '@sanity/telemetry'

import {commandIdentity} from './cliCommandIdentity.js'
import {sanitizeCliFlagRecord, sanitizeCliFlags} from './cliTelemetryFlags.js'

type Fields = Record<string, unknown>
type Rule = (value: unknown) => unknown
type Schema = Record<string, Rule>

const record = (value: unknown): Fields =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {}
const boolean: Rule = (value) => (typeof value === 'boolean' ? value : undefined)
const number: Rule = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const matching =
  (pattern: RegExp): Rule =>
  (value) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined
const oneOf =
  (...values: string[]) =>
  (value: unknown): string | undefined =>
    typeof value === 'string' && values.includes(value) ? value : undefined
const listOf =
  (rule: Rule): Rule =>
  (value) =>
    Array.isArray(value)
      ? value.map((item) => rule(item)).filter((item) => item !== undefined)
      : undefined
const version = matching(/^v?\d{1,4}\.\d{1,4}\.\d{1,4}$/)
const cliProjectId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-z0-9]{8}$/.test(value) ? value : undefined
const sessionId = matching(/^session_[0-7][0-9a-hjkmnp-tv-z]{25}$/)
const traceId = matching(
  /^trace_(?:[0-7][0-9a-hjkmnp-tv-z]{25}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
)
const editor = oneOf(
  'Antigravity',
  'Claude Code',
  'Cline',
  'Codex CLI',
  'Cursor',
  'Gemini CLI',
  'GitHub Copilot CLI',
  'MCPorter',
  'OpenCode',
  'VS Code',
  'VS Code Insiders',
  'Zed',
)
const agent = oneOf(
  'antigravity',
  'claude-code',
  'cline',
  'codex',
  'cursor',
  'gemini-cli',
  'github-copilot',
  'opencode',
)
const yesNo = oneOf('yes', 'no')
const errorName = oneOf(
  'AbortError',
  'AggregateError',
  'ClientError',
  'CLIError',
  'Error',
  'RangeError',
  'ReferenceError',
  'ServerError',
  'SyntaxError',
  'TypeError',
  'URIError',
)

function project(input: unknown, schema: Schema): Fields {
  const source = record(input)
  const result: Fields = {}
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.hasOwn(source, key)) continue
    const value = rule(source[key])
    if (value !== undefined) result[key] = value
  }
  return result
}

const userProperties: Schema = {
  cliVersion: version,
  cpuArchitecture: oneOf(
    'arm',
    'arm64',
    'ia32',
    'loong64',
    'mips',
    'mipsel',
    'ppc',
    'ppc64',
    'riscv64',
    's390',
    's390x',
    'x64',
  ),
  machinePlatform: oneOf(
    'aix',
    'android',
    'darwin',
    'freebsd',
    'linux',
    'openbsd',
    'sunos',
    'win32',
  ),
  projectId: cliProjectId,
  runtime: oneOf('node', 'bun', 'deno'),
  runtimeVersion: version,
}
const initSteps: Record<string, Schema> = {
  configureAppProject: {selectedOption: oneOf('create', 'existing', 'skip')},
  createOrSelectDataset: {
    selectedOption: oneOf('create', 'none', 'select', 'skip'),
    visibility: oneOf('public', 'private'),
  },
  createOrSelectProject: {
    projectId: cliProjectId,
    selectedOption: oneOf('create', 'none', 'select'),
  },
  fetchJourneyConfig: {isFirstProject: boolean, projectId: cliProjectId},
  importTemplateDataset: {selectedOption: yesNo},
  login: {alreadyLoggedIn: boolean},
  mcpSetup: {
    configuredEditors: listOf(editor),
    detectedEditors: listOf(editor),
    skipped: boolean,
  },
  selectPackageManager: {selectedOption: oneOf('npm', 'yarn', 'pnpm', 'bun')},
  selectProjectTemplate: {},
  sendCommunityInvite: {selectedOption: yesNo},
  skillsSetup: {installedAgents: listOf(agent), skipped: boolean},
  start: {flags: sanitizeCliFlagRecord},
  useDefaultPlanCoupon: {selectedOption: yesNo},
  useDefaultPlanId: {selectedOption: yesNo},
  useDetectedFramework: {selectedOption: yesNo},
  useTypeScript: {selectedOption: yesNo},
}
const eventSchemas: Record<string, {fields: Schema; versions: number[]}> = {
  'App Build Completed': {fields: {outputSize: number}, versions: [0]},
  'CLI Command Executed': {fields: {}, versions: [1, 2]},
  'CLI Init Step Completed': {fields: {}, versions: [1, 2]},
  'CLI Login Step Completed': {
    fields: {step: oneOf('selectProvider', 'waitForToken')},
    versions: [1],
  },
  'CLI MCP Configure Completed': {
    fields: {
      configuredEditors: listOf(editor),
      detectedEditors: listOf(editor),
    },
    versions: [1],
  },
  'CLI Skills Install Completed': {
    fields: {detectedEditors: listOf(editor), installedAgents: listOf(agent)},
    versions: [1],
  },
  'Schema Built': {fields: {extractManifest: boolean}, versions: [0]},
  'Schema Deployed': {
    fields: {extractManifest: boolean, schemaRequired: boolean},
    versions: [1],
  },
  'Schema Extracted': {
    fields: {
      enforceRequiredFields: boolean,
      schemaAllTypesCount: number,
      schemaDocumentTypesCount: number,
      schemaFormat: oneOf('groq-type-nodes'),
      schemaTypesCount: number,
    },
    versions: [0],
  },
  'Schema Extraction Watch Mode': {
    fields: {
      averageExtractionDuration: number,
      enforceRequiredFields: boolean,
      extractionFailedCount: number,
      extractionSuccessfulCount: number,
      schemaFormat: oneOf('groq-type-nodes'),
      step: oneOf('started', 'stopped'),
      watcherDuration: number,
    },
    versions: [0],
  },
  'Studio Build Completed': {fields: {outputSize: number}, versions: [0]},
  'Typegen Resources Used': {
    fields: {boundSchemaCount: number, mode: oneOf('generate', 'watch'), resourceCount: number},
    versions: [1],
  },
  'Typegen Watch Mode Started': {
    fields: {
      averageGenerationDuration: number,
      generationFailedCount: number,
      generationSuccessfulCount: number,
      step: oneOf('started', 'stopped'),
      watcherDuration: number,
    },
    versions: [0],
  },
  'Types Generated': {
    fields: {
      configMethod: oneOf('legacy', 'cli'),
      configOverloadClientMethods: boolean,
      emptyUnionTypeNodesGenerated: number,
      filesWithErrors: number,
      outputSize: number,
      queriesCount: number,
      queryFilesCount: number,
      schemaTypesCount: number,
      typeNodesGenerated: number,
      unknownTypeNodesGenerated: number,
      unknownTypeNodesRatio: number,
    },
    versions: [0],
  },
}

function commandContext(input: unknown): Fields {
  const fields = record(input)
  const result = project(fields, {emptyCommand: boolean})
  if ('groupOrCommand' in fields || 'commandArguments' in fields) {
    Object.assign(result, commandIdentity(fields.groupOrCommand, fields.commandArguments))
  }
  if ('extraArguments' in fields) result.extraArguments = sanitizeCliFlags(fields.extraArguments)
  if ('coreOptions' in fields)
    result.coreOptions = project(fields.coreOptions, {
      debug: boolean,
      help: boolean,
      version: boolean,
    })
  return result
}

export function sanitizeTelemetryEvent(event: TelemetryEvent): TelemetryEvent {
  const fields = record(event)
  const result: Fields = {
    ...project(fields, {sessionId, traceId, version: number}),
    createdAt: new Date(event.createdAt).toISOString(),
    redactionVersion: 1,
    source: 'cli',
    type:
      oneOf(
        'log',
        'userProperties',
        'trace.start',
        'trace.log',
        'trace.complete',
        'trace.error',
      )(fields.type) ?? 'log',
  }
  if (fields.type === 'userProperties') {
    result.properties = project(fields.properties, userProperties)
    return result as TelemetryEvent
  }
  const name = typeof fields.name === 'string' ? fields.name : ''
  const schema = Object.hasOwn(eventSchemas, name) ? eventSchemas[name] : undefined
  result.name = schema ? name : 'CLI Other Event'
  result.data = {}
  if (schema && schema.versions.includes(fields.version as number)) {
    result.data = project(fields.data, schema.fields)
    result.context = project(fields.context, schema.fields)
    if (name === 'CLI Command Executed') {
      result.context = commandContext(fields.context)
      result.data = commandContext(fields.data)
    }
    if (name === 'CLI Init Step Completed') {
      const data = record(fields.data)
      if (typeof data.step === 'string' && Object.hasOwn(initSteps, data.step)) {
        result.data = {
          step: data.step,
          ...project(data, initSteps[data.step]),
        }
      }
    }
  }
  if (fields.type === 'trace.error') {
    result.data = {
      message: 'CLI operation failed',
      name: errorName(record(fields.data).name) ?? 'Error',
    }
  }
  return result as TelemetryEvent
}

export function telemetryError(error: unknown) {
  return {message: 'CLI operation failed', name: errorName(record(error).name) ?? 'Error'}
}
