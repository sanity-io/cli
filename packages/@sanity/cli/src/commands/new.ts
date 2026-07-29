import {Args, Flags} from '@oclif/core'

import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../util/mintProjectConstants.js'
import {MintProjectCommand} from './projects/mint.js'

/**
 * Top-level alias for `sanity projects mint`.
 * Subclassed to share implementation and give `sanity new` its own entry in help output.
 */
export class NewCommand extends MintProjectCommand {
  static override args = {
    projectName: Args.string({
      description: 'Display name for the project',
      required: false,
    }),
  }

  static override description =
    'Create a Sanity project without an account to get started.\n' +
    '\n' +
    'By default, this creates two folders: ./sanity, a Studio where you write and edit content, ' +
    'and ./web, a connected Next.js website. Use --no-scaffold to create only the project.\n' +
    '\n' +
    `Claim the project with a Sanity account within ${CLAIM_WINDOW_HOURS} hours. Claiming is free, ` +
    'takes about a minute, and keeps everything you built working. If it is not claimed by the ' +
    'deadline, the project and all its content are permanently deleted.\n' +
    '\n' +
    'The claim link and access token are secrets. Credentials are saved in a gitignored .env ' +
    'file. The token can read and change all content, so never copy it into browser code. ' +
    'After claiming, remove the token when you are ready to use your own account.\n' +
    '\n' +
    `Setup details for people and agents: ${SANITY_NEW_URL}. If you are an agent: give the claim ` +
    'link to the person you are working for so they can open it themselves before the deadline.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create a project and starter apps',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My New Project"',
      description: 'Create a project named "My New Project"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --yes',
      description: 'Create a project non-interactively with defaults',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --no-scaffold',
      description: 'Create only the project without starter apps',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Create a project and return its credentials as JSON without writing files',
    },
  ]

  static override flags = {
    ...MintProjectCommand.flags,
    force: Flags.boolean({
      default: false,
      description:
        'Create a fresh project even when .env already has Sanity credentials (the file is left untouched; replacement values are printed)',
    }),
    scaffold: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Create ./sanity (a Studio for editing content) and ./web (a connected Next.js website); use --no-scaffold for the project only',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip prompts and use the default project name',
    }),
  }

  // Don't inherit the parent's `project:mint` alias — it must resolve to a single command.
  static override hiddenAliases: string[] = []
}
