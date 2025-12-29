import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'
import {chalk, confirm} from '@sanity/cli-core/ux'

import {previewAction} from '../actions/preview/previewAction.js'

export const previewDebug = subdebug('preview')

export class PreviewCommand extends SanityCommand<typeof PreviewCommand> {
  // sanity start is an alias for sanity preview
  static override aliases: string[] = ['start']

  static override args = {
    outputDir: Args.directory({description: 'Output directory'}),
  }

  static override description = 'Starts a server to preview a production build'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
    '<%= config.bin %> <%= command.id %> some/build-output-dir',
  ]

  static override flags = {
    host: Flags.string({
      default: 'localhost',
      description: 'The local network interface at which to listen.',
    }),
    port: Flags.string({
      default: '3333',
      description: 'TCP port to start server on.',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(PreviewCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()

    const {outputDir} = args

    const defaultRootDir = path.resolve(path.join(workDir, 'dist'))
    const outDir = path.resolve(outputDir || defaultRootDir)

    try {
      await previewAction({cliConfig, flags, outDir, workDir})
    } catch (error) {
      if (error.name !== 'BUILD_NOT_FOUND') {
        previewDebug(`Failed to start preview server`, {error})
        this.output.error(error.message, {exit: 1})
      }

      this.output.log(chalk.red.bgBlack(error.message))
      this.output.log(chalk.red.bgBlack('\n'))

      const shouldRunDevServer =
        isInteractive() &&
        (await confirm({
          message: 'Do you want to start a development server instead?',
        }))

      if (shouldRunDevServer) {
        // TODO: Implement dev server
        this.output.log(chalk.green.bgBlack('Starting development server...'))
      } else {
        // Indicate that this isn't an expected exit
        this.output.error(`Failed to start preview server`, {exit: 1})
      }
    }
  }
}
