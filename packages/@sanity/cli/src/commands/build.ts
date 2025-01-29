import {Args, Command, Flags} from '@oclif/core'

export default class Build extends Command {
  static override args = {
    outputDir: Args.directory({default: 'dist', description: 'Output directory'}),
  }
  static override description = 'Builds the Sanity Studio configuration into a static bundle'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --no-minify',
    '<%= config.bin %> <%= command.id %> --source-maps',
  ]
  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable auto updates of studio versions',
    }),
    minify: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable/disable minifying of built bundles',
    }),
    'source-maps': Flags.boolean({
      allowNo: true,
      default: false,
      description: 'Enable source maps for built bundles (increases size of bundle)',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Build)
    console.log(flags)
  }
}
