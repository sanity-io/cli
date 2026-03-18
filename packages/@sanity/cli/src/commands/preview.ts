import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {previewAction} from '../actions/preview/previewAction.js'
import {type PreviewServer} from '../server/previewServer.js'

export const previewDebug = subdebug('preview')

export class PreviewCommand extends SanityCommand<typeof PreviewCommand> {
  static override args = {
    outputDir: Args.directory({description: 'Output directory'}),
  }

  static override deprecateAliases = true

  static override description = 'Starts a server to preview a production build'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
    '<%= config.bin %> <%= command.id %> some/build-output-dir',
  ]

  static override flags = {
    host: Flags.string({
      description: '[default: localhost] The local network interface at which to listen.',
    }),
    port: Flags.string({
      description: '[default: 3333] TCP port to start server on.',
    }),
  }
  static override hiddenAliases: string[] = ['start']

  public async run(): Promise<PreviewServer | void> {
    const {args, flags} = await this.parse(PreviewCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()

    const {outputDir} = args

    const defaultRootDir = path.resolve(path.join(workDir, 'dist'))
    const outDir = path.resolve(outputDir || defaultRootDir)

    try {
      return await previewAction({cliConfig, flags, outDir, workDir})
    } catch (error: unknown) {
      const suggestions =
        error instanceof Error && error.name === 'BUILD_NOT_FOUND'
          ? [
              '`sanity build` to create a production build',
              '`sanity dev` to run a development server',
            ]
          : undefined

      const message = error instanceof Error ? error.message : String(error)
      this.output.error(`Failed to start preview server: ${message}`, {
        exit: 1,
        suggestions,
      })
    }
  }
}
