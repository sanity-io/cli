import {type Command} from '@oclif/core'
import {isInteractive, SanityCommand} from '@sanity/cli-core'
import {CLIError} from '@sanity/cli-core/ux'

import {initArgDefs, initFlagDefs} from '../actions/init/flags.js'
import {initAction} from '../actions/init/initAction.js'
import {InitError} from '../actions/init/initError.js'
import {flagsToInitOptions} from '../actions/init/types.js'
import {toOclifArgs, toOclifFlags} from '../util/flagAdapter.js'

export class InitCommand extends SanityCommand<typeof InitCommand> {
  static override args = toOclifArgs(initArgDefs)
  static override description = 'Initialize a new Sanity Studio, project and/or app'
  static override enableJsonFlag = true

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    {
      command: '<%= config.bin %> <%= command.id %> --dataset-default',
      description: 'Initialize a new project with a public dataset named "production"',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project abc123 --dataset production --output-path ~/myproj',
      description: 'Initialize a project with the given project ID and dataset to the given path',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project abc123 --dataset staging --template moviedb --output-path .',
      description:
        'Initialize a project with the given project ID and dataset using the moviedb template to the given path',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project-name "Movies Unlimited" --dataset moviedb --visibility private --template moviedb --output-path /Users/espenh/movies-unlimited',
      description: 'Create a brand new project with name "Movies Unlimited"',
    },
  ] satisfies Array<Command.Example>

  static override flags = toOclifFlags(initFlagDefs, {
    env: {
      parse: async (input: string) => {
        if (!input.startsWith('.env')) {
          throw new CLIError('Env filename (`--env`) must start with `.env`')
        }
        return input
      },
    },
  })

  public async run(): Promise<void> {
    // Compute MCP mode from flags and environment:
    // - CI (no TTY) or --no-mcp: skip MCP entirely
    // - --yes (user terminal): auto-configure all detected editors
    // - Interactive: prompt user
    let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
    if (!this.flags.mcp || !isInteractive()) {
      mcpMode = 'skip'
    } else if (this.flags.yes) {
      mcpMode = 'auto'
    }

    try {
      await initAction(flagsToInitOptions(this.flags, this.isUnattended(), this.args, mcpMode), {
        output: this.output,
        telemetry: this.telemetry,
        workDir: process.cwd(),
      })
    } catch (error) {
      if (error instanceof InitError) {
        this.error(error.message, {exit: error.exitCode})
      }
      throw error
    }
  }
}
