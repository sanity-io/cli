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
import {Config, Parser} from '@oclif/core'
import {getHelpFlagAdditions, normalizeArgv} from '@oclif/core/help'
import {CLI_TELEMETRY_SYMBOL, exitCodes, noopLogger, setCliTelemetry} from '@sanity/cli-core'
import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {parseArgsStringToArgv} from 'string-argv'

import {commandPolicies} from './commandPolicies/index.js'
import {
  type CommandPolicySet,
  deny,
  type InvocationSource,
  isConditionalInvocationPolicy,
} from './commandPolicies/policy.js'
import {isHelpRequest, renderInvokableHelp} from './help.js'

/**
 * Load the oclif `Config` for this package, needed to resolve, load, and run
 * commands. Loading it once and reusing it across invocations avoids
 * re-reading the command manifest per call.
 */
function loadCliCommandConfig(): Promise<Config> {
  return Config.load(import.meta.url)
}

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
}

/**
 * @internal
 */
export interface InvokeSanityCliResult {
  /** `0` on success, the command's exit code otherwise. */
  exitCode: number

  /** Combined stdout and stderr output, in emission order. */
  output: string
}

let cachedConfig: Promise<Config> | undefined

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
export async function invokeSanityCli({
  args,
  config,
  source,
  token,
}: InvokeSanityCliOptions): Promise<InvokeSanityCliResult> {
  const resolvedConfig = config ?? (await (cachedConfig ??= loadCliCommandConfig()))
  const policySet = commandPolicies[source]

  // Commands log through the global telemetry store; default it to a noop
  // store so embedding hosts need no telemetry wiring (and see no warnings),
  // without clobbering a store the host may have installed itself.
  if (!(globalThis as Record<symbol, unknown>)[CLI_TELEMETRY_SYMBOL]) {
    setCliTelemetry(noopLogger)
  }

  // Pre-split argv arrays are taken verbatim; only string input goes through
  // shell-style tokenization and quote normalization.
  let argv =
    typeof args === 'string'
      ? parseArgsStringToArgv(args).map((t) => stripFlagQuotes(t))
      : [...args]
  if (argv[0] === 'sanity') argv = argv.slice(1)

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
      const output = await renderInvokableHelp(resolvedConfig, helpArgv, policySet)
      if (output !== undefined) return {exitCode: exitCodes.SUCCESS, output}
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
      output = `\nThe ${usedDeniedFlags.map((name) => `--${name}`).join(', ')} flag is not supported here for \`${displayId}\``
    }

    return {
      exitCode: exitCodes.USAGE_ERROR,
      output,
    }
  }

  const output: string[] = []
  const sink = (line: string) => output.push(line)

  try {
    await runWithCliExecutionContext({stderr: sink, stdout: sink, token}, () =>
      CommandClass.run(commandArgv, resolvedConfig),
    )
    return {exitCode: exitCodes.SUCCESS, output: output.join('\n')}
  } catch (err) {
    const exit = err.oclif?.exit

    // `this.exit(0)` throws an ExitError but is a successful outcome
    if (exit === exitCodes.SUCCESS) {
      return {exitCode: exitCodes.SUCCESS, output: output.join('\n')}
    }

    const message = err instanceof Error ? err.message : String(err)
    if (message) output.push(message)
    return {
      exitCode: typeof exit === 'number' ? exit : exitCodes.RUNTIME_ERROR,
      output: output.join('\n'),
    }
  }
}
