import {styleText} from 'node:util'

import {Command, Interfaces} from '@oclif/core'
import {type CommandError} from '@oclif/core/interfaces'

import {getCliConfig} from './config/cli/getCliConfig.js'
import {type CliConfig} from './config/cli/types/cliConfig.js'
import {findProjectRoot} from './config/findProjectRoot.js'
import {type ProjectRootResult} from './config/util/recursivelyResolveProjectRoot.js'
import {subdebug} from './debug.js'
import {NonInteractiveError} from './errors/NonInteractiveError.js'
import {ProjectRootNotFoundError} from './errors/ProjectRootNotFoundError.js'
import {
  getGlobalCliClient,
  getProjectCliClient,
  type GlobalCliClientOptions,
  type ProjectCliClientOptions,
} from './services/apiClient.js'
import {type CLITelemetryStore} from './telemetry/types.js'
import {type Output} from './types.js'
import {getCliTelemetry, reportCliTraceError} from './util/getCliTelemetry.js'
import {isInteractive} from './util/isInteractive.js'

type Flags<T extends typeof Command> = Interfaces.InferredFlags<
  (typeof SanityCommand)['baseFlags'] & T['flags']
>

type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

const debug = subdebug('sanityCommand')

export abstract class SanityCommand<T extends typeof Command> extends Command {
  protected args!: Args<T>
  protected flags!: Flags<T>

  /**
   * Get the global API client.
   *
   * @param args - The global API client options.
   * @returns The global API client.
   *
   * @deprecated use `getGlobalCliClient` function directly instead.
   */
  protected getGlobalApiClient = (args: GlobalCliClientOptions) => getGlobalCliClient(args)

  /**
   * Get the project API client.
   *
   * @param args - The project API client options.
   * @returns The project API client.
   *
   * @deprecated use `getProjectCliClient` function directly instead.
   */
  protected getProjectApiClient = (args: ProjectCliClientOptions) => getProjectCliClient(args)

  /**
   * Helper for outputting to the console.
   *
   * @example
   * ```ts
   * this.output.log('Hello')
   * this.output.warn('Warning')
   * this.output.error('Error')
   * ```
   */
  protected output: Output = {
    error: this.error.bind(this),
    log: this.log.bind(this),
    warn: this.warn.bind(this),
  }

  /**
   * The telemetry store.
   *
   * @returns The telemetry store.
   */
  protected telemetry!: CLITelemetryStore

  /**
   * Report real command errors to the CLI command trace.
   * User aborts (SIGINT, ExitPromptError) are not reported — the trace is left
   * incomplete, which accurately represents that the command was interrupted.
   */
  protected override async catch(err: CommandError): Promise<void> {
    // ExitPromptError is thrown by `@inquirer/prompts` when the user cancels a prompt
    // The `message === 'SIGINT'` check matches oclif's own convention (see handle.js in @oclif/core)
    if (err.name === 'ExitPromptError' || err.message === 'SIGINT') {
      // 130 is the standard exit code for script termination by Ctrl+C
      this.logToStderr(styleText('yellow', '\u{203A}') + ' Aborted by user')
      return this.exit(130)
    }

    // In other cases, we _do_ want to report the error
    reportCliTraceError(err)
    return super.catch(err)
  }

  /**
   * Get the CLI config.
   *
   * @returns The CLI config.
   */
  protected async getCliConfig(): Promise<CliConfig> {
    const root = await this.getProjectRoot()

    debug(`Using project root`, root)
    return getCliConfig(root.directory)
  }

  /**
   * Get the project ID from passed flags or (if not provided) the CLI config.
   *
   * Optionally accepts a `fallback` function that is called when no project ID
   * can be determined from flags or config. This allows commands to provide
   * interactive project selection while keeping the prompt logic in the CLI package.
   *
   * If the fallback throws a `NonInteractiveError` (e.g. because the terminal is
   * not interactive), it falls through to the standard error with suggestions.
   *
   * Optionally accepts a `deprecatedFlagName` for commands that have a deprecated
   * flag (e.g. `--project`) that should be checked after `--project-id` but before
   * the CLI config.
   *
   * @returns The project ID.
   */
  protected async getProjectId(options?: {
    deprecatedFlagName?: string
    fallback?: () => Promise<string>
  }): Promise<string> {
    const hasProjectFlag = this.ctor.flags != null && 'project-id' in this.ctor.flags

    // Check --project-id flag first
    if (hasProjectFlag) {
      const flagProjectId =
        'project-id' in this.flags && typeof this.flags['project-id'] === 'string'
          ? this.flags['project-id']
          : undefined

      if (flagProjectId) return flagProjectId
    }

    // Check deprecated flag (e.g. --project) before CLI config
    if (options?.deprecatedFlagName) {
      const deprecatedValue =
        options.deprecatedFlagName in this.flags &&
        typeof this.flags[options.deprecatedFlagName] === 'string'
          ? (this.flags[options.deprecatedFlagName] as string)
          : undefined

      if (deprecatedValue) return deprecatedValue
    }

    // Fall back to CLI config
    try {
      const config = await this.getCliConfig()
      const configProjectId = config.api?.projectId
      if (configProjectId) return configProjectId
    } catch (err) {
      if (!(err instanceof ProjectRootNotFoundError)) throw err
      // No project root — fall through to fallback/error
    }

    // Offer interactive selection if a fallback was provided
    if (options?.fallback) {
      try {
        return await options.fallback()
      } catch (err) {
        if (!(err instanceof NonInteractiveError)) throw err
        // Non-interactive: throw with actionable suggestions
        throw new ProjectRootNotFoundError('Unable to determine project ID', {
          cause: err,
          suggestions: [
            ...(hasProjectFlag ? ['Providing a project ID: --project-id <project-id>'] : []),
            'Running this command from within a Sanity project directory',
            'Running in an interactive terminal to get a project selection prompt',
          ],
        })
      }
    }

    throw new ProjectRootNotFoundError('Unable to determine project ID', {
      suggestions: [
        ...(hasProjectFlag ? ['Providing a project ID: --project-id <project-id>'] : []),
        'Running this command from within a Sanity project directory',
      ],
    })
  }

  /**
   * Get the project's root directory by resolving the config
   *
   * @returns The project root result.
   */
  protected getProjectRoot(): Promise<ProjectRootResult> {
    return findProjectRoot(process.cwd())
  }

  public async init(): Promise<void> {
    const {args, flags} = await this.parse({
      args: this.ctor.args,
      baseFlags: (super.ctor as typeof SanityCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })

    this.args = args as Args<T>
    this.flags = flags as Flags<T>
    this.telemetry = getCliTelemetry()

    await super.init()
  }

  /**
   * Check if the command is running in unattended mode.
   *
   * This means the command should not ask for user input, instead using defaults where
   * possible, and if that does not make sense (eg there's missing information), then we
   * should error out (remember to exit with a non-zero code).
   *
   * Most commands should take an explicit `--yes` flag to enable unattended mode, but
   * some commands may also be run in unattended mode if `process.stdin` is not a TTY
   * (eg when running in a CI environment).
   */
  protected isUnattended(): boolean {
    return this.flags.yes || !this.resolveIsInteractive()
  }

  /**
   * Resolver for checking if the terminal is interactive. Override in tests to provide mock values.
   *
   * @returns Whether the terminal is interactive.
   */
  protected resolveIsInteractive(): boolean {
    return isInteractive()
  }

  /**
   * Get the CLI config, returning an empty config if no project root is found.
   *
   * Use this instead of `getCliConfig()` in commands that can operate without a
   * project directory (e.g. when `--project-id` and `--dataset` flags are provided).
   *
   * @returns The CLI config, or an empty config object if no project root is found.
   */
  protected async tryGetCliConfig(): Promise<CliConfig> {
    try {
      return await this.getCliConfig()
    } catch (err) {
      if (!(err instanceof ProjectRootNotFoundError)) throw err
      return {}
    }
  }
}
