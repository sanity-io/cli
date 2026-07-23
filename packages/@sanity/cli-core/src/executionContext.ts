import {AsyncLocalStorage} from 'node:async_hooks'

/**
 * Explicit, per-invocation execution context for running CLI commands
 * programmatically (e.g. from an MCP server or another embedding host).
 *
 * When a context is active, it overrides the process-global defaults the CLI
 * normally relies on:
 *
 * - `token` takes precedence over `SANITY_AUTH_TOKEN` and the stored CLI
 *   config token, and never touches the process-wide token cache
 * - `stdout`/`stderr` receive the output that commands would otherwise write
 *   to the process streams
 * - interactivity checks report non-interactive, so commands fail fast with
 *   actionable errors instead of prompting
 * - project root resolution from the filesystem is disabled: commands never
 *   read (or execute) `sanity.config.ts`/`sanity.cli.ts` files found near the
 *   host process's cwd, so project context must come from explicit flags
 *   (e.g. `--project-id`)
 *
 * The CLI binary never enters a context, so its behavior is unchanged.
 *
 * @public
 */
export interface CliExecutionContext {
  /**
   * Sink for output the command would otherwise write to `process.stderr`.
   * Called once per line, without a trailing newline.
   */
  stderr?: (line: string) => void

  /**
   * Sink for output the command would otherwise write to `process.stdout`.
   * Called once per line, without a trailing newline.
   */
  stdout?: (line: string) => void

  /**
   * Auth token to use for API clients created during this invocation.
   * Overrides `SANITY_AUTH_TOKEN` and the stored CLI config token.
   */
  token?: string
}

const storage = new AsyncLocalStorage<CliExecutionContext>()

/**
 * Run `fn` with the given execution context active. The context is visible
 * (via {@link getCliExecutionContext}) to all code in the async call graph of
 * `fn`, and invisible to everything else — concurrent invocations with
 * different contexts are fully isolated.
 *
 * @public
 */
export function runWithCliExecutionContext<T>(context: CliExecutionContext, fn: () => T): T {
  return storage.run(context, fn)
}

/**
 * Get the active execution context, if any. Returns `undefined` when running
 * as the regular CLI (process-global behavior applies).
 *
 * @public
 */
export function getCliExecutionContext(): CliExecutionContext | undefined {
  return storage.getStore()
}
