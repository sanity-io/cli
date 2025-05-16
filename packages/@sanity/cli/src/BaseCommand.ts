import {Command, Interfaces} from '@oclif/core'

import {getCliConfig} from './config/cli/getCliConfig.js'
import {type CliConfig} from './config/cli/types.js'
import {findProjectRoot, type ProjectRootResult} from './config/findProjectRoot.js'

type Flags<T extends typeof Command> = Interfaces.InferredFlags<
  (typeof SanityCliCommand)['baseFlags'] & T['flags']
>

type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export abstract class SanityCliCommand<T extends typeof Command> extends Command {
  protected args!: Args<T>
  protected flags!: Flags<T>

  public async getCliConfig(): Promise<CliConfig> {
    const root = await this.getProjectRoot()
    const config = await getCliConfig(root.directory)

    return config
  }

  public async getProjectRoot(): Promise<ProjectRootResult> {
    const root = await findProjectRoot(process.cwd())
    if (!root) {
      throw new Error('Project root not found')
    }

    return root
  }

  public async init(): Promise<void> {
    const {args, flags} = await this.parse({
      args: this.ctor.args,
      baseFlags: (super.ctor as typeof SanityCliCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })

    this.args = args as Args<T>
    this.flags = flags as Flags<T>

    await super.init()
  }
}
