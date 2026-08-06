import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {createFlow, input} from '@sanity/cli-core/ux'

import {
  FRONTEND_DIR,
  FRONTEND_ENV_FILE,
  getUnavailableScaffoldTarget,
  scaffoldProject,
  type ScaffoldResult,
  STUDIO_DIR,
  STUDIO_ENV_FILE,
} from '../actions/scaffold/scaffoldProject.js'
import {type MintedProject, mintUnclaimedProject} from '../services/mintProject.js'
import {
  fetchNewInstructions,
  INSTRUCTIONS_URL,
  InstructionsUnavailableError,
} from '../services/newInstructions.js'
import {formatClaimDeadline} from '../util/formatClaimDeadline.js'
import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../util/mintProjectConstants.js'
import {renderNewCommandSplash} from '../util/newCommandSplash.js'
import {recordUnclaimedProject} from '../util/unclaimedProjects.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'
const HELP_DESCRIPTION_WIDTH = 78

/**
 * Prepended to the fetched instructions so an agent cannot read this command's success as the
 * project already existing. The only addition to an otherwise verbatim document.
 */
const INSTRUCTIONS_HEADER = '# Nothing has been created yet — follow these steps.'

function formatHelpDescription(...paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => {
      const lines: string[] = []
      let line = ''

      for (const word of paragraph.split(/\s+/u)) {
        if (!line || line.length + word.length + 1 <= HELP_DESCRIPTION_WIDTH) {
          line = line ? `${line} ${word}` : word
        } else {
          lines.push(line)
          line = word
        }
      }

      if (line) lines.push(line)
      return lines.join('\n')
    })
    .join('\n\n')
}

const FRONTEND_DEV_COMMANDS: Record<
  NonNullable<ScaffoldResult['frontendPackageManager']>,
  string
> = {
  bun: 'bun dev',
  manual: 'npm run dev',
  npm: 'npm run dev',
  pnpm: 'pnpm dev',
  yarn: 'yarn dev',
}

function frontendDevCommand(packageManager: ScaffoldResult['frontendPackageManager']): string {
  return packageManager ? FRONTEND_DEV_COMMANDS[packageManager] : 'npm run dev'
}

function frontendInstallCommand(packageManager: ScaffoldResult['frontendPackageManager']): string {
  switch (packageManager) {
    case 'bun': {
      return 'bun add next-sanity'
    }
    case 'pnpm': {
      return 'pnpm add --save-prod next-sanity'
    }
    case 'yarn': {
      return 'yarn add next-sanity'
    }
    default: {
      return 'npm install next-sanity'
    }
  }
}

export interface NewProjectResult {
  apiHost: string
  claimApiUrl: string
  claimToken: string
  claimUrl: string
  dataset: string
  expiresAt: string
  projectId: string
  terms: {
    notice: string
    url: string
  }
  token: string
}

function toResult(project: MintedProject): NewProjectResult {
  return {
    apiHost: project.apiHost,
    claimApiUrl: project.claimApiUrl,
    claimToken: project.claimToken,
    claimUrl: project.claimUrl,
    dataset: project.datasetName,
    expiresAt: project.expiresAt,
    projectId: project.resourceId,
    terms: {notice: project.termsNotice, url: project.termsUrl},
    token: project.token,
  }
}

export class NewCommand extends SanityCommand<typeof NewCommand> {
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
    'Two things to keep private: the claim link, because anyone who opens it becomes the owner, ' +
      `and the access token saved in ./${STUDIO_ENV_FILE} and ./${FRONTEND_ENV_FILE}, because it ` +
      'can read and change everything in the project. Keep both env files out of git, and never ' +
      'put the token in code that runs in the browser.',
    'Run this command with --instructions for the full agent setup guide.',
  )

  static override enableJsonFlag = true

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

    {
      command: '<%= config.bin %> <%= command.id %> --instructions',
      description: 'Print the full setup guide for an AI agent, without creating anything',
    },
  ]

  static override flags = {
    instructions: Flags.boolean({
      default: false,
      description: `Print the full setup guide from ${SANITY_NEW_URL} and exit, creating nothing`,
    }),
    scaffold: Flags.boolean({
      allowNo: true,
      default: true,
      description: `Set up a Studio in ./${STUDIO_DIR} and a Next.js website in ./${FRONTEND_DIR} (on by default)`,
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: `Skip prompts and use defaults (project: "${DEFAULT_PROJECT_NAME}")`,
    }),
  }

  static override summary = `Create a Sanity project without an account, and claim it within ${CLAIM_WINDOW_HOURS} hours to keep it.`

  public async run(): Promise<NewProjectResult | undefined> {
    const {output} = this
    const json = this.jsonEnabled()
    const flow = createFlow(output.log)
    const invoked = [this.config.bin, ...(this.id?.split(':') ?? [])].join(' ')
    const cwd = process.cwd()

    // Runs before every precondition and side effect: this flag creates nothing.
    if (this.flags.instructions) {
      // oclif's `exclusive` does not cover the json flag added by enableJsonFlag, so guard it here.
      if (json) {
        throw new CLIError('--instructions cannot be combined with --json.', {
          code: 'INSTRUCTIONS_JSON_CONFLICT',
          exit: exitCodes.USAGE_ERROR,
          suggestions: [
            `Run \`${invoked} --instructions\` for the setup guide as markdown`,
            `Or run \`${invoked} --json\` to create a project and print its details as JSON`,
          ],
        })
      }

      await this.printInstructions()
      return undefined
    }

    const unavailableScaffoldTarget =
      !json && this.flags.scaffold ? await getUnavailableScaffoldTarget(cwd) : undefined
    if (unavailableScaffoldTarget) {
      throw new CLIError(
        `./${unavailableScaffoldTarget} is not an empty directory. No project was created.`,
        {
          code:
            unavailableScaffoldTarget === STUDIO_DIR
              ? 'EXISTING_STUDIO_DIRECTORY'
              : 'EXISTING_FRONTEND_DIRECTORY',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `Run this command where ./${unavailableScaffoldTarget} does not exist or is an empty directory`,
            `Or run \`${invoked} --no-scaffold\` to create the project without changing ./${unavailableScaffoldTarget}`,
          ],
        },
      )
    }

    if (!json) {
      renderNewCommandSplash(output.log)
      flow.intro('Setting up your Sanity project.')
      flow.gap()

      if (!this.isUnattended()) {
        flow.note(
          `${styleText('cyan', `${invoked} --yes`)} for a non-interactive flow with defaults.`,
        )
        flow.gap()
      }
    }

    let displayName = this.args.projectName?.trim()
    if (!displayName && this.isUnattended()) {
      displayName = DEFAULT_PROJECT_NAME
    } else if (!displayName) {
      displayName =
        (
          await input({
            default: DEFAULT_PROJECT_NAME,
            message: 'Project name',
          })
        ).trim() || DEFAULT_PROJECT_NAME
    }

    const spin = json ? undefined : flow.spin('Creating your project...')
    let project: MintedProject
    try {
      project = await mintUnclaimedProject({displayName})
    } catch (err) {
      spin?.fail('Creating your project failed.')
      throw err
    }

    const recorded = recordUnclaimedProject(project)
    spin?.succeed(`Created "${displayName}"`)

    if (!json) {
      flow.result(`Project ID: ${styleText('cyan', project.resourceId)}`)
      flow.result(`Dataset: ${styleText('cyan', project.datasetName)} (where your content lives)`)
      flow.result(`Token: ${styleText('cyan', project.token)}`)
      flow.link(project.claimUrl, {label: 'Claim link:'})
      flow.gap()
      flow.highlight(
        `Claim your project by ${styleText('yellow', formatClaimDeadline(project.expiresAt))} to avoid losing it.`,
      )
      flow.gap()
      flow.line('To use the Sanity CLI before claiming use your token by setting')
      flow.command(`SANITY_AUTH_TOKEN="${project.token}" sanity "command"`)
      flow.gap()
      flow.note(
        styleText(
          'dim',
          'If you are an agent: give this claim URL to the person you are working for. They have ' +
            'to open it themselves before the deadline.',
        ),
      )
      flow.gap()
    }

    const studioUrl =
      `http://localhost:3333/#token=${encodeURIComponent(project.token)}` +
      `&claim=${encodeURIComponent(project.claimUrl)}`

    const printStudioInstructions = () => {
      flow.highlight('Start your Studio:')
      flow.gap()
      flow.command(`cd ${STUDIO_DIR} && npx sanity dev`)
      flow.gap()
      flow.link(studioUrl, {label: 'Then open this link:'})
      flow.gap()
      flow.line('The token signs you in: there is no account yet.')
    }
    const printWebsiteInstructions = (packageManager: ScaffoldResult['frontendPackageManager']) => {
      flow.highlight('In a separate terminal, start your website:')
      flow.gap()
      flow.command(`cd ${FRONTEND_DIR} && ${frontendDevCommand(packageManager)}`)
      flow.gap()
      flow.link('http://localhost:3000', {label: 'Then open this link:'})
    }

    let scaffold: ScaffoldResult | undefined
    if (!json && this.flags.scaffold) {
      const scaffoldController = new AbortController()
      const abortScaffold = () => scaffoldController.abort(new Error('SIGINT'))
      process.once('SIGINT', abortScaffold)
      try {
        scaffold = await scaffoldProject({
          cancelSignal: scaffoldController.signal,
          dataset: project.datasetName,
          displayName,
          output,
          projectId: project.resourceId,
          telemetry: this.telemetry,
          token: project.token,
          workDir: cwd,
        })
        scaffoldController.signal.throwIfAborted()
      } catch (err) {
        if (
          scaffoldController.signal.aborted ||
          (err instanceof Error && err.message === 'SIGINT')
        ) {
          throw err
        }
        // Scaffolding is best-effort and may leave files or directories behind when it fails.
        // Partial filesystem state does not prove the scaffold is runnable, so report the failure,
        // continue only with the project/token/claim handoff below, and do not attempt cleanup.
        flow.note(`Automatic setup did not finish: ${err instanceof Error ? err.message : err}`)
        flow.line('The project was created. You do not need to create another one.')
        flow.gap()
      } finally {
        process.off('SIGINT', abortScaffold)
      }
    }

    if (scaffold) {
      if (scaffold.frontendPath) {
        flow.result('Created two folders')
        flow.line(`./${STUDIO_DIR}: your Studio, where you write and edit content`)
        flow.line(`./${FRONTEND_DIR}: your website, a Next.js app that reads it`)
        flow.gap()
        printStudioInstructions()
        if (scaffold.frontendDependenciesInstalled === false) {
          flow.gap()
          if (scaffold.frontendDependencyError) {
            flow.line(`Installing website dependencies failed: ${scaffold.frontendDependencyError}`)
            flow.gap()
          }
          flow.highlight('Finish installing your website dependencies')
          flow.gap()
          flow.command(
            `cd ${FRONTEND_DIR} && ${frontendInstallCommand(scaffold.frontendPackageManager)}`,
          )
        }
        flow.gap()
        printWebsiteInstructions(scaffold.frontendPackageManager)
      } else if (scaffold.detectedFramework) {
        flow.result(`Created ./${STUDIO_DIR} for your existing ${scaffold.detectedFramework} app`)
        flow.line(`./${STUDIO_DIR}: your Studio, where you write and edit content`)
        flow.line(`Your existing ${scaffold.detectedFramework} frontend was left unchanged.`)
        flow.gap()
        printStudioInstructions()
      } else {
        flow.result(`Created ./${STUDIO_DIR}`)
        flow.line(`./${STUDIO_DIR}: your Studio, where you write and edit content`)
        flow.line(
          `The website was not created: ${scaffold.frontendCreationError ?? 'automatic setup did not finish'}`,
        )
        flow.gap()
        printStudioInstructions()
      }
      flow.gap()
    }

    if (recorded === false && !json) {
      flow.note('The local recovery record was not saved.')
      flow.line('Keep the claim URL and access token from this output.')
      flow.gap()
    }

    if (!json) {
      if (!scaffold && !this.flags.scaffold) {
        flow.result('Project created without scaffolding')
        flow.line(
          'No folders or env files were created. Use the project ID and dataset above in your own setup.',
        )
        flow.gap()
        flow.link(studioUrl, {
          label: 'Once a Studio is running on http://localhost:3333, sign in with:',
        })
        flow.gap()
        flow.line('The token signs you in: there is no account yet.')
        flow.gap()
      }

      flow.line('Your content is private until you claim, to read it, you need the token.')
      flow.line("Treat your token as a password and don't expose it publicly in your app.")
      flow.gap()
      flow.line(
        'The claim link and token are printed above but you can recover them ' +
          `with ${styleText('cyan', 'sanity projects unclaimed')} before the timer runs out on ${formatClaimDeadline(project.expiresAt)}.`,
      )
      flow.gap()
      flow.line(project.termsNotice)
      flow.link(project.termsUrl, {label: 'Terms of Service:'})
      flow.gap()
      flow.line('For more information on how claiming works or how to build your app')
      flow.link(SANITY_NEW_URL, {label: 'visit', outro: true})
    }

    return toResult(project)
  }

  /**
   * Dumps the guide from sanity.new verbatim, so an agent gets the whole document rather than a
   * summary produced by whatever fetched it.
   */
  private async printInstructions(): Promise<void> {
    let instructions: string
    try {
      instructions = await fetchNewInstructions()
    } catch (err) {
      if (err instanceof InstructionsUnavailableError) {
        throw new CLIError(err.message, {
          code: 'INSTRUCTIONS_UNAVAILABLE',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `Fetch them directly: curl -sSL ${INSTRUCTIONS_URL}`,
            `Or open ${SANITY_NEW_URL} in a browser`,
          ],
        })
      }
      throw err
    }

    this.output.log(`${INSTRUCTIONS_HEADER}\n\n${instructions}`)
  }
}
