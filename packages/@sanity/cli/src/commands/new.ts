import {Args, Flags} from '@oclif/core'

import {FRONTEND_DIR, STUDIO_DIR} from '../actions/scaffold/scaffoldProject.js'
import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../util/mintProjectConstants.js'
import {formatHelpDescription, MintProjectCommand} from './projects/mint.js'

/**
 * Top-level alias for `sanity projects mint`.
 * Subclassed to share implementation and give `sanity new` its own entry in help output.
 *
 * Help text is deliberately not shared with the parent: `projects mint` is the plumbing command
 * and can stay technical, while `sanity new` is the door most people arrive at.
 */
export class NewCommand extends MintProjectCommand {
  static override args = {
    projectName: Args.string({
      description: 'Display name for the new project',
      required: false,
    }),
  }

  static override description = formatHelpDescription(
    `Sets up two folders here: ./${STUDIO_DIR}, a Studio where you write and edit your content, ` +
      `and ./${FRONTEND_DIR}, a Next.js website that reads it. Both are already connected to your ` +
      'new project, so you can start them straight away. Use --no-scaffold if you just want the ' +
      'project and nothing else.',
    `The project is real and works immediately, but it is only yours for ${CLAIM_WINDOW_HOURS} hours. Claim it with ` +
      'a Sanity account before the deadline and everything you have built stays exactly as it is. ' +
      'Claiming is free and takes about a minute. Miss the deadline and the project and its ' +
      'content are deleted.',
    'Two things to keep private. The claim link, because anyone who opens it becomes the owner. ' +
      'And the access token saved in ./.env, because it can read and change everything in the ' +
      'project - .env is added to .gitignore for you, and the token must never go into code that ' +
      'runs in the browser.',
    `Fetch ${SANITY_NEW_URL} for full instructions, or point your AI agent at it.`,
  )

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a project with a Studio and a website',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My New Project"',
      description: 'Create a project called "My New Project"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --yes',
      description: 'Create a project without being asked anything',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --no-scaffold',
      description: 'Create the project only, with no Studio or website',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Create a project and print its details as JSON',
    },
  ]

  static override flags = {
    ...MintProjectCommand.flags,
    force: Flags.boolean({
      default: false,
      description:
        'Create a new project even when .env already has Sanity setup values (the file is left untouched; the new values are printed for you to apply)',
    }),
    scaffold: Flags.boolean({
      allowNo: true,
      default: true,
      description: `Set up a Studio in ./${STUDIO_DIR} and a Next.js website in ./${FRONTEND_DIR} (on by default)`,
    }),
  }

  static override hiddenAliases: string[] = []

  static override summary = `Create a Sanity project without an account, and claim it within ${CLAIM_WINDOW_HOURS} hours to keep it.`
}
