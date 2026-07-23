/**
 * Programmatic (in-process) invocation of CLI commands, e.g. from an MCP
 * server. This is a curated allowlist: only commands that are pure API
 * operations — no filesystem access, no interactive-only flows — are
 * invokable here.
 *
 * Most hosts should use {@link runSanityCli}, which handles arg parsing,
 * command dispatch, per-invocation auth, and output capture:
 * ```ts
 * import {runSanityCli} from '@sanity/cli/commands'
 *
 * const {exitCode, output} = await runSanityCli({
 *   args: 'cors list --project-id abc123',
 *   token: extra.authInfo.token,
 * })
 * ```
 *
 * The command classes and `loadCliCommandConfig` are also exported for hosts
 * that want to invoke a specific command directly via `Command.run(argv, config)`
 * inside their own `runWithCliExecutionContext` wrapper.
 */
import {fileURLToPath} from 'node:url'

import {Config} from '@oclif/core'
import {CLI_TELEMETRY_SYMBOL, exitCodes, noopLogger, setCliTelemetry} from '@sanity/cli-core'
import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'

import {Add as CorsAdd} from '../commands/cors/add.js'
import {Delete as CorsDelete} from '../commands/cors/delete.js'
import {List as CorsList} from '../commands/cors/list.js'
import {List as ProjectsList} from '../commands/projects/list.js'
import {tokenizeCliArgs} from '../util/tokenizeCliArgs.js'

/**
 * Load the oclif `Config` for this package, needed as the second argument to
 * `Command.run(argv, config)`. Loading it once and reusing it across
 * invocations avoids re-reading the command manifest per call.
 *
 * @internal
 */
export function loadCliCommandConfig(): Promise<Config> {
  // Resolves to the package root from both src/exports (dev) and dist/exports (built)
  return Config.load(fileURLToPath(new URL('../..', import.meta.url)))
}

/**
 * Minimal structural type for an invokable oclif command class.
 */
interface InvokableCommand {
  run(argv: string[], config: Config): Promise<unknown>
}

/**
 * Dispatch table from command id to command class. This doubles as the
 * allowlist: anything not in this table cannot be invoked through
 * {@link runSanityCli}.
 */
const invokableCommands: ReadonlyMap<string, InvokableCommand> = new Map<string, InvokableCommand>([
  ['cors add', CorsAdd],
  ['cors delete', CorsDelete],
  ['cors list', CorsList],
  ['projects list', ProjectsList],
])

function resolveCommand(argv: string[]): {argv: string[]; command: InvokableCommand} | undefined {
  // Accept both separator styles: `cors list` and `cors:list`
  const tokens = argv[0]?.includes(':') ? [...argv[0].split(':'), ...argv.slice(1)] : argv

  // Longest command id first, so future single-token commands can coexist
  for (const idLength of [2, 1]) {
    const command = invokableCommands.get(tokens.slice(0, idLength).join(' '))
    if (command) return {argv: tokens.slice(idLength), command}
  }
  return undefined
}

/**
 * @internal
 */
export interface RunSanityCliOptions {
  /**
   * Arguments after `sanity` (a leading `sanity` token is tolerated), either
   * as a single string — shell-style quoting is supported, but no shell is
   * ever executed — or as a pre-split argv array.
   */
  args: string | string[]

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
export interface RunSanityCliResult {
  /** `0` on success, the command's exit code otherwise. */
  exitCode: number

  /** Combined stdout and stderr output, in emission order. */
  output: string
}

let cachedConfig: Promise<Config> | undefined

/**
 * Run an allowlisted CLI command in-process and capture its result.
 *
 * Command-level failures (unknown command, bad flags, API errors) are
 * reported through `exitCode`/`output` rather than thrown, so callers can
 * relay them verbatim.
 *
 * @internal
 */
export async function runSanityCli({
  args,
  config,
  token,
}: RunSanityCliOptions): Promise<RunSanityCliResult> {
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

  const resolved = resolveCommand(argv)
  if (!resolved) {
    return {
      exitCode: exitCodes.USAGE_ERROR,
      output: [
        `Unknown or unsupported command: ${argv.slice(0, 2).join(' ') || '(none)'}`,
        `Available commands: ${[...invokableCommands.keys()].join(', ')}`,
      ].join('\n'),
    }
  }

  const output: string[] = []
  const sink = (line: string) => output.push(line)

  // oclif's error handling sets `process.exitCode` as a side effect; restore
  // it so a failed invocation can't change the host process's exit status.
  const previousExitCode = process.exitCode
  try {
    const oclifConfig = config ?? (await (cachedConfig ??= loadCliCommandConfig()))

    await runWithCliExecutionContext({stderr: sink, stdout: sink, token}, () =>
      resolved.command.run(resolved.argv, oclifConfig),
    )
    return {exitCode: exitCodes.SUCCESS, output: output.join('\n')}
  } catch (err) {
    const exit = (err as {oclif?: {exit?: false | number}}).oclif?.exit

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

export {Add as CorsAdd} from '../commands/cors/add.js'
export {Delete as CorsDelete} from '../commands/cors/delete.js'
export {List as CorsList} from '../commands/cors/list.js'
export {List as ProjectsList} from '../commands/projects/list.js'
