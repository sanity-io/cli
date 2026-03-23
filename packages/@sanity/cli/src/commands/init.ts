import {type Command} from '@oclif/core'
import {isInteractive, SanityCommand} from '@sanity/cli-core'

import {initArgDefs, initFlagDefs} from '../actions/init/flags.js'
import {
  flagsToInitOptions,
  type InitCommandArgs,
  type InitCommandFlags,
} from '../actions/init/flagsToInitOptions.js'
import {initAction} from '../actions/init/initAction.js'
import {InitError} from '../actions/init/initError.js'
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

  // Env validation is handled in flagsToInitOptions (shared with create-sanity)
  static override flags = toOclifFlags(initFlagDefs)

  public async run(): Promise<void> {
    // Compute MCP mode from flags and environment:
    // - CI (no TTY) or --no-mcp: skip MCP entirely
    // - --yes (user terminal): auto-configure all detected editors
    // - Interactive: prompt user
    // toOclifFlags returns FlagInput (untyped) so oclif can't infer the
    // specific flag shape. The types are structurally guaranteed by initFlagDefs.
    const flags = this.flags as unknown as InitCommandFlags
    const args = this.args as unknown as InitCommandArgs

    let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
    if (!flags.mcp || !isInteractive()) {
      mcpMode = 'skip'
    } else if (flags.yes) {
      mcpMode = 'auto'
    }

    try {
      await initAction(flagsToInitOptions(flags, this.isUnattended(), args, mcpMode), {
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
