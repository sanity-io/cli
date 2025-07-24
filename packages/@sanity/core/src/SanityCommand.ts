import {Command, Interfaces} from '@oclif/core'

import {getCliConfig} from './config/cli/getCliConfig.js'
import {type CliConfig} from './config/cli/types.js'
import {findProjectRoot} from './config/findProjectRoot.js'
import {type ProjectRootResult} from './config/util/recursivelyResolveProjectRoot.js'
import {getGlobalCliClient, type GlobalCliClientOptions} from './services/apiClient.js'
import {type Output} from './types.js'

type Flags<T extends typeof Command> = Interfaces.InferredFlags<
  (typeof SanityCommand)['baseFlags'] & T['flags']
>

type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export abstract class SanityCommand<T extends typeof Command> extends Command {
  protected args!: Args<T>
  protected flags!: Flags<T>

  /**
   * Get the global API client.
   *
   * @param args - The global API client options.
   * @returns The global API client.
   */
  protected getGlobalApiClient = (args: GlobalCliClientOptions) => getGlobalCliClient(args)

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
   * Get the CLI config.
   *
   * @returns The CLI config.
   */
  protected async getCliConfig(): Promise<CliConfig> {
    const root = await this.getProjectRoot()
    const config = await getCliConfig(root.directory)

    return config
  }

  /**
   * Get the project ID from the CLI config.
   *
   * @returns The project ID or `undefined` if it's not set.
   */
  protected async getProjectId(): Promise<string | undefined> {
    const config = await this.getCliConfig()

    return config.api?.projectId
  }

  /**
   * Get the project's root directory by resolving the config
   *
   * @returns The root project root.
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

    await super.init()
  }
}
