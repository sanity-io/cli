/**
 * MCP tool definitions generated from CLI command definitions: the oclif
 * manifest supplies names, arguments, flags, and descriptions; the command
 * policy decides what may be advertised. A generated tool never advertises
 * surface {@link invokeSanityCli} would refuse.
 *
 * The command list is a whitelist, not a filter: an id that is unknown or
 * denied throws rather than silently narrowing the tool list.
 *
 * ```ts
 * const [contextList] = await getMcpToolDefinitions({commands: ['context:list']})
 *
 * const {exitCode, output} = await invokeSanityCli({
 *   args: mcpToolInputToArgv(contextList, {organization: 'org-abc123'}),
 *   source: 'mcp',
 *   token: extra.authInfo.token,
 * })
 * ```
 */
import {type Command, type Config, type Interfaces} from '@oclif/core'
import {type CommandPolicy, isConditionalInvocationPolicy} from '@sanity/cli-core/commandPolicy'
import {mcpFlagOverrides, resolveUnattendedFlagRequirements} from '@sanity/cli-core/flags'

import {resolveCommandPolicies} from './commandPolicies/index.js'
import {cachedCliCommandConfig, supportsIsolatedExecution} from './invokableCommands.js'
import {mcpToolCommands} from './mcpToolCommands.js'

/**
 * The subset of JSON Schema that oclif argument and flag definitions map onto.
 *
 * @internal
 */
export interface McpToolInputSchema {
  additionalProperties: false
  properties: Record<string, McpToolInputProperty>
  type: 'object'

  required?: string[]
}

interface McpToolInputProperty {
  type: 'array' | 'boolean' | 'string'

  description?: string
  enum?: string[]
  items?: {enum?: string[]; type: 'string'}
  minLength?: number
}

/**
 * How a schema property maps back to a CLI flag: a plain boolean, a boolean
 * whose `false` is spelled `--no-<name>`, a repeatable value, or a single
 * value.
 */
type McpToolFlagKind = 'boolean' | 'booleanAllowNo' | 'multiple' | 'value'

/**
 * An MCP tool generated from one CLI command. `name`, `description`, and
 * `inputSchema` are the advertised tool; the remaining fields let
 * {@link mcpToolInputToArgv} translate a tool call back into an invocation.
 *
 * @internal
 */
export interface McpToolDefinition {
  /** Canonical oclif command id the tool executes (for example `context:list`). */
  commandId: string

  /** Tool description, taken from the command's own description. */
  description: string

  /** How each flag-backed schema property translates back to a flag. */
  flagKinds: Record<string, McpToolFlagKind>

  /**
   * Whether invocations append `--json`: the flag is omitted from the schema
   * and forced on instead, so callers always get structured output where it exists.
   */
  forceJson: boolean

  /** JSON Schema for the tool's input: positional arguments and flags by name. */
  inputSchema: McpToolInputSchema

  /** MCP tool name: the command id with `:` replaced by `_`. */
  name: string

  /** Positional argument names in declaration order. */
  positionalArguments: string[]

  /**
   * Whether the command's policy marks it read-only. Unmarked commands should
   * be treated as potentially destructive.
   */
  readOnly: boolean

  /** Human-readable tool title derived from the command id (`Context Imports List`). */
  title: string
}

/**
 * @internal
 */
export interface GetMcpToolDefinitionsOptions {
  /**
   * Command ids to expose, in order; defaults to {@link mcpToolCommands}. An
   * id that is unknown, policy-denied, or not isolatable throws —
   * misconfiguration surfaces where definitions are built, not as a failing
   * tool call.
   */
  commands?: string[]

  /**
   * Optional oclif config override (mainly for tests). Defaults to this
   * package's config, loaded once and cached across invocations.
   */
  config?: Config
}

/**
 * Generate MCP tool definitions for an explicit set of CLI commands,
 * executable via {@link invokeSanityCli} with {@link mcpToolInputToArgv}.
 *
 * @internal
 */
export async function getMcpToolDefinitions(
  options: GetMcpToolDefinitionsOptions = {},
): Promise<McpToolDefinition[]> {
  const config = options.config ?? (await cachedCliCommandConfig())
  const policySet = await resolveCommandPolicies(config, 'mcp')

  const commands = options.commands ?? mcpToolCommands
  const duplicate = commands.find((id, index) => commands.indexOf(id) !== index)
  if (duplicate) {
    throw new Error(`Cannot expose "${duplicate}" as an MCP tool twice: tool names must be unique`)
  }

  return Promise.all(
    commands.map(async (commandId) => {
      const command = config.findCommand(commandId)
      if (!command) {
        throw new Error(`Cannot expose "${commandId}" as an MCP tool: no such command`)
      }

      const policy = policySet[commandId]
      if (!policy || policy.kind === 'deny') {
        throw new Error(`Cannot expose "${commandId}" as an MCP tool: denied by the MCP policy`)
      }

      const CommandClass = await command.load()
      if (!supportsIsolatedExecution(CommandClass)) {
        throw new Error(
          `Cannot expose "${commandId}" as an MCP tool: it does not support isolated execution`,
        )
      }

      return toToolDefinition(command, policy, CommandClass)
    }),
  )
}

function toToolDefinition(
  command: Command.Loadable,
  policy: CommandPolicy,
  CommandClass: Command.Class,
): McpToolDefinition {
  // Positional arguments and flags share one schema (and its `required`
  // list), so both collectors write into the same accumulators. Null
  // prototype: a flag or arg named like an Object member (`toString`,
  // `__proto__`) must behave like any other name.
  const properties: Record<string, McpToolInputProperty> = Object.create(null)
  const required: string[] = []

  const positionalArguments = collectArguments(command, properties, required)
  const {flagKinds, forceJson} = collectFlags(command, policy, CommandClass, properties, required)

  return {
    commandId: command.id,
    description:
      (CommandClass as {mcpOverrides?: {description?: string}}).mcpOverrides?.description ??
      command.description ??
      command.summary ??
      '',
    flagKinds,
    forceJson,
    inputSchema: {
      additionalProperties: false,
      properties,
      ...(required.length > 0 && {required}),
      type: 'object',
    },
    name: command.id.replaceAll(':', '_'),
    positionalArguments,
    readOnly: policy.readOnly === true,
    title: toTitle(command.id),
  }
}

/** `context:imports:list` → `Context Imports List`. */
function toTitle(commandId: string): string {
  return commandId
    .split(':')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Add the command's positional arguments to the schema accumulators and
 * return their names in declaration order.
 */
function collectArguments(
  command: Command.Loadable,
  properties: Record<string, McpToolInputProperty>,
  required: string[],
): string[] {
  const positionalArguments: string[] = []
  for (const arg of Object.values(command.args)) {
    // The parser fills positionals by declaration order including hidden ones,
    // which would shift every advertised value into the wrong slot.
    if (arg.hidden) {
      throw new Error(
        `Cannot expose "${command.id}" as an MCP tool: hidden positional arguments are not supported`,
      )
    }
    positionalArguments.push(arg.name)
    // minLength: an empty positional would vanish from the request path,
    // rerouting the call (e.g. a document URL becomes the collection URL).
    properties[arg.name] = {
      ...(arg.description && {description: arg.description}),
      ...(arg.options && {enum: [...arg.options]}),
      minLength: 1,
      type: 'string',
    }
    if (arg.required) required.push(arg.name)
  }
  return positionalArguments
}

/**
 * Add the command's advertisable flags to the schema accumulators and return
 * how each maps back to argv, plus whether invocations force `--json`.
 */
function collectFlags(
  command: Command.Loadable,
  policy: CommandPolicy,
  CommandClass: Command.Class,
  properties: Record<string, McpToolInputProperty>,
  required: string[],
): {flagKinds: Record<string, McpToolFlagKind>; forceJson: boolean} {
  // Same rule as the policy-scoped help renderer: never advertise surface the
  // policy would refuse.
  const deniedFlags = new Set(isConditionalInvocationPolicy(policy) ? policy.deniedFlags : [])

  // Merged the same way help rendering and the execution pre-parse merge
  // them, so this stays the one place that can't disagree about a command's
  // flags.
  const loadedFlags = {...CommandClass.baseFlags, ...CommandClass.flags} as Interfaces.FlagInput

  // MCP invocations are always unattended, so unattended-required flags (a
  // marker the manifest cannot carry) must be required in the schema too, or
  // every call omitting them fails at execution.
  const unattendedFlags = resolveUnattendedFlagRequirements(loadedFlags, true)

  const flagKinds: Record<string, McpToolFlagKind> = {}
  let forceJson = command.enableJsonFlag === true
  for (const flag of Object.values(command.flags)) {
    if (flag.hidden) {
      // A hidden flag can't be advertised, and a required one would then
      // fail every call at parse.
      if (flag.required) {
        throw new Error(
          `Cannot expose "${command.id}" as an MCP tool: hidden required flags are not supported`,
        )
      }
      continue
    }
    if (deniedFlags.has(flag.name)) continue
    if (flag.type === 'boolean' && flag.name === 'json') {
      forceJson = true
      continue
    }
    if (Object.hasOwn(properties, flag.name)) {
      throw new Error(`Command "${command.id}" has an argument and a flag both named ${flag.name}`)
    }
    const overrides = mcpFlagOverrides(loadedFlags[flag.name])
    properties[flag.name] = toProperty(flag, overrides?.description)
    flagKinds[flag.name] = toFlagKind(flag)
    if (overrides?.required ?? (flag.required || unattendedFlags[flag.name]?.required)) {
      required.push(flag.name)
    }
  }
  return {flagKinds, forceJson}
}

function toProperty(flag: Command.Flag.Cached, mcpDescription?: string): McpToolInputProperty {
  const summary = mcpDescription ?? flag.summary ?? flag.description
  // Without stated defaults a caller can't know what omitting a flag means.
  // (oclif never caches boolean defaults, so only these types occur.)
  const hasDefault = ['number', 'string'].includes(typeof flag.default)
  const description = [summary, hasDefault && `(default: ${flag.default})`]
    .filter(Boolean)
    .join(' ')

  if (flag.type === 'boolean') {
    return {...(description && {description}), type: 'boolean'}
  }

  const values = flag.options && {enum: [...flag.options]}
  return flag.multiple
    ? {...(description && {description}), items: {...values, type: 'string'}, type: 'array'}
    : {...(description && {description}), ...values, type: 'string'}
}

function toFlagKind(flag: Command.Flag.Cached): McpToolFlagKind {
  if (flag.type === 'boolean') return flag.allowNo ? 'booleanAllowNo' : 'boolean'
  return flag.multiple ? 'multiple' : 'value'
}

/**
 * Build the argv for one generated-tool call, ready for
 * {@link invokeSanityCli} as pre-split `args` (values verbatim, no quoting).
 * Ambiguous positional shapes throw; everything else is the CLI parser's to
 * reject. Invoke with `helpRequests: false` so a value spelled like a help
 * flag can't divert the call into a help render.
 *
 * @internal
 */
export function mcpToolInputToArgv(
  definition: McpToolDefinition,
  input: Record<string, unknown>,
): string[] {
  // Flags first — before any input-controlled token, so a value of exactly
  // `--` (oclif's end-of-flags terminator) can't demote them to positionals.
  const argv = [definition.commandId]
  if (definition.forceJson) argv.push('--json')

  for (const [name, kind] of Object.entries(definition.flagKinds)) {
    const value = Object.hasOwn(input, name) ? input[name] : undefined
    if (value === undefined) continue

    if (kind === 'boolean' || kind === 'booleanAllowNo') {
      // Coercing here would silently DROP e.g. the string "true", and a
      // dropped flag never reaches the parser to be rejected.
      if (typeof value !== 'boolean') {
        throw new TypeError(`Flag "${name}" expects a boolean, got ${typeof value}`)
      }
      if (value === true) argv.push(`--${name}`)
      else if (kind === 'booleanAllowNo') argv.push(`--no-${name}`)
    } else if (kind === 'multiple') {
      for (const item of Array.isArray(value) ? value : [value]) {
        argv.push(`--${name}`, String(item))
      }
    } else {
      argv.push(`--${name}`, String(value))
    }
  }

  // Behind `--`, a positional value can never be read as a flag. A value
  // supplied after a missing positional would bind to the wrong slot: throw.
  const positionals: string[] = []
  let missingPositional: string | undefined
  for (const name of definition.positionalArguments) {
    // Own-property reads: an absent input named `toString` must not resolve
    // to Object.prototype's.
    const raw = Object.hasOwn(input, name) ? input[name] : undefined
    if (raw === undefined) {
      missingPositional ??= name
      continue
    }
    if (missingPositional) {
      throw new Error(
        `Cannot pass "${name}" without "${missingPositional}": positional arguments fill in order`,
      )
    }
    const value = String(raw)
    if (value === '') {
      throw new Error(`Positional argument "${name}" cannot be empty`)
    }
    positionals.push(value)
  }
  if (positionals.length > 0) argv.push('--', ...positionals)

  return argv
}
