/**
 * Programmatic (in-process) invocation of CLI commands, e.g. from an MCP
 * server. The invokable surface is governed by a per-source command policy
 * (see ./commandPolicies): every CLI command is explicitly allowed, denied,
 * or allowed conditionally on the parsed invocation.
 *
 * {@link invokeSanityCli} handles arg parsing, policy enforcement, command
 * dispatch, per-invocation auth, and output capture.
 * ```ts
 * import {invokeSanityCli} from '@sanity/cli/invokeSanityCli'
 *
 * const {exitCode, output} = await invokeSanityCli({
 *   args: 'cors list --project-id abc123',
 *   source: 'mcp',
 *   token: extra.authInfo.token,
 * })
 * ```
 *
 * Help works like the regular CLI, scoped to the source's policy: `--help`
 * (or `help`) renders root help listing the invokable topics, and a subject
 * (`cors --help`, `cors list --help`) renders topic or command help.
 */
import {Command, Config, Parser, settings} from '@oclif/core'
import {getHelpFlagAdditions, normalizeArgv} from '@oclif/core/help'
import {exitCodes} from '@sanity/cli-core'
import {runWithCliExecutionContext, type SanityEnvironment} from '@sanity/cli-core/executionContext'
import {type SanityCommand} from '@sanity/cli-core/SanityCommand'
import {parseArgsStringToArgv} from 'string-argv'

import {resolveTopicAliasInArgv} from '../../topicAliases.js'
import {commandPolicies} from './commandPolicies/index.js'
import {
  type CommandPolicySet,
  deny,
  type InvocationSource,
  isConditionalInvocationPolicy,
} from './commandPolicies/policy.js'
import {isHelpRequest, renderInvokableHelp} from './help.js'
import {prettyPrintError} from './prettyPrintError.js'

type InvokableCommand = Pick<SanityCommand<typeof Command>, 'runInExecutionContext'>

/**
 * Instantiate a policy-approved command for isolated execution.
 *
 * Every invokable command extends `SanityCommand`, whose
 * `runInExecutionContext()` runs the instance without oclif's static
 * `Command.run()` — the static runner re-enters `Config.load()` (filesystem
 * reads and a process-global config cache write) on every call. The manifest
 * types command classes as the abstract oclif `Command`, hence the
 * constructor cast. The method is probed rather than checked with
 * `instanceof`, because command modules may load from the compiled build
 * while this module runs from source, giving `SanityCommand` two identities.
 */
function instantiateCommand(
  CommandClass: Command.Class,
  argv: string[],
  config: Config,
): InvokableCommand {
  const ConcreteCommand = CommandClass as unknown as new (argv: string[], config: Config) => Command
  const command = new ConcreteCommand(argv, config) as Command & Partial<InvokableCommand>
  if (typeof command.runInExecutionContext !== 'function') {
    throw new TypeError(`Command "${CommandClass.id}" does not support isolated execution`)
  }
  return command as InvokableCommand
}

/**
 * Load the oclif `Config` for this package, needed to resolve, load, and run
 * commands. Loading it once and reusing it across invocations avoids
 * re-reading the command manifest per call. It only reads this package's own
 * installed files — process-lifetime initialization, not per-invocation host
 * state — so it happens outside any execution context.
 */
function loadCliCommandConfig(): Promise<Config> {
  return Config.load(import.meta.url)
}

let cachedConfig: Promise<Config> | undefined

function unknownCommandResult(argv: string[], policySet: CommandPolicySet): InvokeSanityCliResult {
  const available = Object.entries(policySet)
    .filter(([, policy]) => policy.kind !== 'deny')
    .map(([id]) => id.replaceAll(':', ' '))
    .toSorted()
  return {
    exitCode: exitCodes.USAGE_ERROR,
    output: [
      `Unknown or unsupported command: ${argv.slice(0, 2).join(' ') || '(none)'}`,
      `Available commands: ${available.join(', ')}`,
    ].join('\n'),
  }
}

/**
 * @internal
 */
export interface InvokeSanityCliOptions {
  /**
   * Arguments after `sanity` (a leading `sanity` token is tolerated), either
   * as a single string — shell-style quoting is supported, but no shell is
   * ever executed — or as a pre-split argv array.
   */
  args: string | string[]

  /**
   * Where this invocation originates. Selects the command policy to enforce:
   * which commands are invokable and which invocations of them are permitted.
   */
  source: InvocationSource

  /**
   * Auth token for this invocation. Scoped to this call via the CLI execution
   * context: it never touches process env or the process-wide token cache, so
   * concurrent invocations with different tokens are fully isolated.
   */
  token: string

  /**
   * Optional oclif config override (mainly for tests). Defaults to this
   * package's config, loaded once and cached across invocations.
   */
  config?: Config

  /**
   * Sanity deployment environment for this invocation. Scoped to this call
   * via the CLI execution context and defaults to production. The embedding
   * process's `SANITY_INTERNAL_ENV` is never consulted.
   */
  sanityEnv?: SanityEnvironment
}

/**
 * @internal
 */
export interface InvokeSanityCliResult {
  /** `0` on success, the command's exit code otherwise. */
  exitCode: number

  /** Combined stdout and stderr output, in emission order. */
  output: string

  /**
   * Canonical oclif command id when the invocation resolved to a command
   * exposed by the selected policy (for example, `datasets:create`).
   */
  commandId?: string
}

/**
 * Unlike a shell, string-argv keeps quotes that are glued to unquoted text:
 * `--name="my project"` tokenizes with the quotes intact. Strip a matching
 * wrapping quote pair from the value side of `--flag=`-shaped tokens so the
 * common shell-style form yields the value the caller intended.
 */
function stripFlagQuotes(rawToken: string): string {
  const match = /^(-{1,2}[^\s=]+=)(['"])([\s\S]*)\2$/.exec(rawToken)
  return match ? match[1] + match[3] : rawToken
}

/**
 * Run a policy-permitted CLI command in-process and capture its result.
 *
 * Command-level failures (unknown command, bad flags, API errors) are
 * reported through `exitCode`/`output` rather than thrown, so callers can
 * relay them verbatim.
 *
 * @internal
 */
export async function invokeSanityCli(
  options: InvokeSanityCliOptions,
): Promise<InvokeSanityCliResult> {
  // Always load compiled command modules. Oclif's dev-mode source resolution
  // otherwise probes tsconfigs (reading the filesystem and process.cwd) on
  // every command load, and may register ts-node process-wide.
  settings.enableAutoTranspile = false

  const resolvedConfig = options.config ?? (await (cachedConfig ??= loadCliCommandConfig()))
  const output: string[] = []
  const sink = (line: string) => output.push(line)
  const {sanityEnv, token} = options

  // Establish the isolation boundary before rendering help, loading command
  // modules, parsing, or executing. Any code reached by an external
  // invocation can therefore fail closed on context.
  return runWithCliExecutionContext({sanityEnv, stderr: sink, stdout: sink, token}, () =>
    invokeSanityCliInContext(options, resolvedConfig, output),
  )
}

async function invokeSanityCliInContext(
  {args, source}: InvokeSanityCliOptions,
  resolvedConfig: Config,
  output: string[],
): Promise<InvokeSanityCliResult> {
  const policySet = commandPolicies[source]

  // Pre-split argv arrays are taken verbatim; only string input goes through
  // shell-style tokenization and quote normalization.
  let argv =
    typeof args === 'string'
      ? parseArgsStringToArgv(args).map((t) => stripFlagQuotes(t))
      : [...args]
  if (argv[0] === 'sanity') argv = argv.slice(1)
  argv = resolveTopicAliasInArgv(argv)

  // Help requests are routed through oclif's help system, scoped to the
  // source's policy: root help for a bare request, topic/command help when a
  // subject is given. Denied subjects get the standard unknown-command
  // response (identical to a truly unknown command, so hosts can't probe the
  // full CLI surface through help), and a help request never executes a
  // command.
  if (isHelpRequest(argv, resolvedConfig)) {
    try {
      // Drop a leading `help` so the rest is the subject, mirroring how
      // oclif's dispatch consumes the token before the help command sees argv
      const helpArgv = argv[0] === 'help' ? argv.slice(1) : argv
      const result = await renderInvokableHelp(resolvedConfig, helpArgv, policySet)
      if (result) return {...result, exitCode: exitCodes.SUCCESS}
      const helpFlags = getHelpFlagAdditions(resolvedConfig)
      return unknownCommandResult(
        helpArgv.filter((token) => !helpFlags.includes(token)),
        policySet,
      )
    } catch (err) {
      return {
        exitCode: exitCodes.RUNTIME_ERROR,
        output: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Resolve the command id the same way oclif's dispatch would (collating
  // space-separated topics, accepting colon-separated ids as-is), then apply
  // the policy. Denied and uncategorized ids fail closed, indistinguishable
  // from commands that don't exist.
  const [commandId = '', ...commandArgv] = normalizeArgv(resolvedConfig, argv)
  const policy = policySet[commandId] ?? deny
  const commandDefinition =
    policy.kind === 'deny' ? undefined : resolvedConfig.findCommand(commandId)
  if (!commandDefinition) return unknownCommandResult(argv, policySet)

  const CommandClass = await commandDefinition.load()

  // Parse with the command's real definitions (without executing anything) so
  // conditional policies are evaluated against typed args/flags, not tokens.
  let invocation: {args: Record<string, unknown>; flags: Record<string, unknown>}
  try {
    const parsed = await Parser.parse(commandArgv, {
      args: CommandClass.args,
      baseFlags: CommandClass.baseFlags,
      enableJsonFlag: CommandClass.enableJsonFlag,
      flags: CommandClass.flags,
      strict: CommandClass.strict,
    })
    invocation = {
      args: parsed.args as Record<string, unknown>,
      flags: parsed.flags as Record<string, unknown>,
    }
  } catch (err) {
    return {
      commandId,
      exitCode: exitCodes.USAGE_ERROR,
      output: err instanceof Error ? err.message : String(err),
    }
  }

  if (!policy.validate(invocation)) {
    const displayId = commandId.replaceAll(':', ' ')
    let output = `This invocation of \`${displayId}\` is not supported here`

    if (isConditionalInvocationPolicy(policy)) {
      const usedDeniedFlags = policy.deniedFlags.filter(
        (name) => invocation.flags[name] !== undefined && invocation.flags[name] !== false,
      )
      if (usedDeniedFlags.length > 0) {
        output = `\nThe ${usedDeniedFlags.map((name) => `--${name}`).join(', ')} flag is not supported here for \`${displayId}\``
      }
    }

    return {
      commandId,
      exitCode: exitCodes.USAGE_ERROR,
      output,
    }
  }

  try {
    const command = instantiateCommand(CommandClass, commandArgv, resolvedConfig)
    await command.runInExecutionContext()
    return {commandId, exitCode: exitCodes.SUCCESS, output: output.join('\n')}
  } catch (err) {
    const exit = err.oclif?.exit

    // `this.exit(0)` throws an ExitError but is a successful outcome
    if (exit === exitCodes.SUCCESS) {
      return {commandId, exitCode: exitCodes.SUCCESS, output: output.join('\n')}
    }

    const message = prettyPrintError(err) || String(err)
    if (message) output.push(message)
    return {
      commandId,
      exitCode: typeof exit === 'number' ? exit : exitCodes.RUNTIME_ERROR,
      output: output.join('\n'),
    }
  }
}
