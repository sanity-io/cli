import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {execScript} from '../actions/exec/execScript.js'

export class ExecCommand extends SanityCommand<typeof ExecCommand> {
  static override args = {
    script: Args.file({
      description: 'Path to the script to execute',
      exists: true,
      required: true,
    }),
  }

  static override description = 'Executes a script within the Sanity Studio context'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> some/script.js',
      description: 'Run the script at some/script.js in Sanity context',
    },
    {
      command: '<%= config.bin %> <%= command.id %> migrations/fullname.ts --with-user-token',
      description:
        "Run the script at migrations/fullname.ts and configure `getCliClient()` from `sanity/cli` to include the current user's token",
    },
    {
      command: '<%= config.bin %> <%= command.id %> scripts/browserScript.js --mock-browser-env',
      description: 'Run the script at scripts/browserScript.js in a mock browser environment',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --mock-browser-env myscript.js -- --dry-run positional-argument',
      description:
        "Pass arbitrary arguments to scripts by separating them with a `--`. Arguments are available in `process.argv` as they would in regular node scripts (eg the following command would yield a `process.argv` of: `['/path/to/node', '/path/to/myscript.js', '--dry-run', 'positional-argument']`)",
    },
  ]

  static override flags = {
    'mock-browser-env': Flags.boolean({
      default: false,
      description: 'Mock a browser environment with jsdom',
    }),
    'with-user-token': Flags.boolean({
      default: false,
      description: 'Include your auth token in getCliClient()',
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const {args, argv, flags} = await this.parse(ExecCommand)
    const {directory: workDir} = await this.getProjectRoot()

    await execScript({
      extraArguments: (argv as string[]).slice(1), // Remove the script path from argv
      flags,
      scriptPath: args.script,
      workDir,
    })
  }
}
