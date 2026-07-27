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
 * (or `help` / `-h`) renders root help listing the invokable topics, and a
 * subject (`cors --help`, `cors list --help`) renders topic or command help.
 */
import {fileURLToPath} from 'node:url'

import {Config, Parser} from '@oclif/core'
import {normalizeArgv} from '@oclif/core/help'
import {CLI_TELEMETRY_SYMBOL, exitCodes, noopLogger, setCliTelemetry} from '@sanity/cli-core'
import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'

import {tokenizeCliArgs} from '../../util/tokenizeCliArgs.js'
import {commandPolicies} from './commandPolicies/index.js'
import {type CommandPolicySet, deny, type InvocationSource} from './commandPolicies/policy.js'
import {isHelpRequest, renderInvokableHelp} from './help.js'

/**
 * Load the oclif `Config` for this package, needed to resolve, load, and run
 * commands. Loading it once and reusing it across invocations avoids
 * re-reading the command manifest per call.
 */
function loadCliCommandConfig(): Promise<Config> {
  // Resolves to the package root from both src/exports (dev) and dist/exports (built)
  return Config.load(fileURLToPath(new URL('../..', import.meta.url)))
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

  let argv: string[]
  try {
    argv = typeof args === 'string' ? tokenizeCliArgs(args) : [...args]
  } catch (err) {
    return {
      exitCode: exitCodes.USAGE_ERROR,
      output: err instanceof Error ? err.message : String(err),
    }
  }
  if (argv[0] === 'sanity') argv = argv.slice(1)

  // Help requests are routed through oclif's help system, scoped to the
  // source's policy: root help for a bare request, topic/command help when a
  // subject is given. Denied subjects get the standard unknown-command
  // response (identical to a truly unknown command, so hosts can't probe the
  // full CLI surface through help), and a help request never executes a
  // command.
  if (isHelpRequest(argv)) {
    try {
      // Drop a leading `help` so the rest is the subject, and present `-h` as
      // `--help`, the only help flag oclif's subject resolution recognizes
      const helpArgv = (argv[0] === 'help' ? argv.slice(1) : argv).map((token) =>
        token === '-h' ? '--help' : token,
      )
      const output = await renderInvokableHelp(resolvedConfig, helpArgv, policySet)
      if (output !== undefined) return {exitCode: exitCodes.SUCCESS, output}
      return unknownCommandResult(
        helpArgv.filter((token) => token !== '--help'),
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
    return {
      exitCode: exitCodes.USAGE_ERROR,
      output: `This invocation of \`${commandId.replaceAll(':', ' ')}\` is not supported here`,
    }
  }

  const output: string[] = []
  const sink = (line: string) => output.push(line)

  // oclif's error handling sets `process.exitCode` as a side effect; restore
  // it so a failed invocation can't change the host process's exit status.
  const previousExitCode = process.exitCode
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
  } finally {
    process.exitCode = previousExitCode
  }
}
