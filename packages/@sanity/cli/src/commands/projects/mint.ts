import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {createFlow, input} from '@sanity/cli-core/ux'

import {
  FRONTEND_DIR,
  FRONTEND_ENV_FILE,
  isStudioScaffoldTargetAvailable,
  manualScaffoldCommands,
  scaffoldProject,
  type ScaffoldResult,
  STUDIO_DIR,
  STUDIO_ENV_FILE,
} from '../../actions/scaffold/scaffoldProject.js'
import {type MintedProject, mintUnclaimedProject} from '../../services/mintProject.js'
import {
  appendEnvValues,
  ensureEnvGitignored,
  GUARDED_ENV_KEYS,
  inspectEnvKeys,
  isEnvTracked,
} from '../../util/envFile.js'
import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../../util/mintProjectConstants.js'
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'
import {recordUnclaimedProject} from '../../util/unclaimedProjects.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'
const HELP_DESCRIPTION_WIDTH = 78
const SCAFFOLD_REQUIRED_ENV_KEYS = ['SANITY_PROJECT_ID'] as const

export function formatHelpDescription(...paragraphs: string[]): string {
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

function formatClaimDeadline(expiresAt: string): string {
  const deadline = new Date(expiresAt)
  if (!Number.isFinite(deadline.getTime())) return expiresAt
  return (
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    })
      .format(deadline)
      .replace(' at ', ', ') + ' UTC'
  )
}

export interface MintProjectResult {
  apiHost: string
  claimApiUrl: string
  claimToken: string
  claimUrl: string
  dataset: string
  expiresAt: string
  projectId: string
  /** Robot token scoped to the freshly minted, unclaimed project. */
  token: string

  warnings?: string[]
}

function toResult(minted: MintedProject, warnings?: string[]): MintProjectResult {
  return {
    apiHost: minted.apiHost,
    claimApiUrl: minted.claimApiUrl,
    claimToken: minted.claimToken,
    claimUrl: minted.claimUrl,
    dataset: minted.datasetName,
    expiresAt: minted.expiresAt,
    projectId: minted.resourceId,
    token: minted.token,
    ...(warnings ? {warnings} : {}),
  }
}

export class MintProjectCommand extends SanityCommand<typeof MintProjectCommand> {
  static override args = {
    projectName: Args.string({
      description: 'Display name for the minted project',
      required: false,
    }),
  }

  static override description = formatHelpDescription(
    `By default this also scaffolds a Studio into ./${STUDIO_DIR} and a Next.js frontend into ` +
      `./${FRONTEND_DIR}, with credentials wired into both; pass --no-scaffold to skip it.`,
    'Credentials are written to ./.env (SANITY_PROJECT_ID, SANITY_DATASET, and ' +
      'SANITY_AUTH_TOKEN, a robot token) and .env is gitignored. This command does not change ' +
      'how the CLI chooses credentials for later commands. Commands that need a project id read ' +
      `it from a Sanity config file or --project-id, so run those from ./${STUDIO_DIR}. Use ` +
      '--json for a machine-readable payload: it writes no files, scaffolds nothing, and the ' +
      'caller owns the credentials.',
    `Claiming: the project must be claimed with a Sanity account within ${CLAIM_WINDOW_HOURS} hours ` +
      '(expiresAt) or it is permanently deleted, content included. The claim URL is single-use ' +
      "and whoever opens it takes ownership: keep it out of git and shared channels. If you're " +
      'an agent, surface the link to the end user immediately. Everything keeps working after ' +
      "you've claimed, including the robot token.",
    'The robot token has full content access to this project: create, edit, publish, and deploy ' +
      'schemas. It cannot deploy a hosted Studio, create datasets, or manage settings. The dataset ' +
      'is private until you claim, so frontend reads must run server-side; claiming makes it ' +
      'public. Wherever it lives, the token must never sit under a browser-exposed prefix.',
    `After the claim, run \`sanity login\` and remove SANITY_AUTH_TOKEN from ./.env or ${STUDIO_ENV_FILE} ` +
      'to act as your own account; until then, CLI commands in this directory keep ' +
      'authenticating as the robot.',
    `Minting is rate-limited per machine. Fetch ${SANITY_NEW_URL} for agent instructions.`,
  )

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively mint an unclaimed project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My New Project"',
      description: 'Mint an unclaimed project named "My New Project"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --yes',
      description: 'Mint a project non-interactively with defaults',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --force',
      description: 'Mint a fresh project even if this directory already has one',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Mint a project and output the token and claim details as JSON',
    },
  ]

  static override flags = {
    force: Flags.boolean({
      default: false,
      description:
        'Mint a new project even when .env already has Sanity setup values (the file is left untouched; the new values are printed for you to apply)',
    }),
    scaffold: Flags.boolean({
      allowNo: true,
      default: true,
      description: `Scaffold a Studio into ./${STUDIO_DIR} and a Next.js frontend into ./${FRONTEND_DIR} after minting; use --no-scaffold to mint only the project`,
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: `Skip prompts and use defaults (project: "${DEFAULT_PROJECT_NAME}")`,
    }),
  }

  static override hiddenAliases: string[] = ['project:mint']

  static override summary = formatHelpDescription(
    'Mint an unclaimed Sanity project without logging in.',
  )

  public async run(): Promise<MintProjectResult> {
    const {output} = this
    const json = this.jsonEnabled()
    const flow = createFlow(output.log)
    const invoked = [this.config.bin, ...(this.id?.split(':') ?? [])].join(' ')
    const cwd = process.cwd()
    const envPath = path.join(cwd, '.env')
    const existingEnvFiles = this.guardExistingProject(
      [
        {displayPath: './.env', path: envPath},
        {displayPath: './.env.local', path: path.join(cwd, '.env.local')},
      ],
      invoked,
    )
    const hasExistingKeys = existingEnvFiles.length > 0
    if (
      !json &&
      this.flags.scaffold &&
      !hasExistingKeys &&
      !(await isStudioScaffoldTargetAvailable(cwd))
    ) {
      throw new CLIError(`./${STUDIO_DIR} is not empty. No project was minted.`, {
        code: 'EXISTING_STUDIO_DIRECTORY',
        exit: exitCodes.RUNTIME_ERROR,
        suggestions: [
          `Move or remove ./${STUDIO_DIR}`,
          `Or run \`${invoked} --no-scaffold\` to mint without changing it`,
        ],
      })
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
        (await input({default: DEFAULT_PROJECT_NAME, message: 'Project name'})).trim() ||
        DEFAULT_PROJECT_NAME
    }

    const spin = json ? undefined : flow.spin('Minting your project...')
    let minted: MintedProject
    try {
      minted = await mintUnclaimedProject({displayName})
    } catch (err) {
      spin?.fail('Minting your project failed.')
      throw err
    }

    const recorded = json ? undefined : recordUnclaimedProject(minted)
    spin?.succeed(`Created "${displayName}"`)

    if (!json) {
      flow.result(`Project ID: ${styleText('cyan', minted.resourceId)}`)
      flow.result(`Dataset: ${styleText('cyan', minted.datasetName)} (where your content lives)`)
      flow.gap()
      flow.highlight(
        `Claim your project by ${styleText('yellow', formatClaimDeadline(minted.expiresAt))}`,
      )
      flow.gap()
      flow.link(minted.claimUrl)
      flow.gap()
      flow.line(
        'Until then it is temporary: the project and everything in it is deleted at that deadline. ' +
          'Claiming is free, takes about a minute, and nothing you have built changes. Treat the ' +
          'link like a password: whoever opens it becomes the owner.',
      )
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

    const envValues = {
      SANITY_AUTH_TOKEN: minted.token,
      SANITY_DATASET: minted.datasetName,
      SANITY_PROJECT_ID: minted.resourceId,
    }
    const printValues = (values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values)) {
        flow.line(`   ${key}="${value}"`)
      }
    }
    const printEnvValues = () => {
      printValues({
        SANITY_AUTH_TOKEN: minted.token,
        SANITY_DATASET: minted.datasetName,
        SANITY_PROJECT_ID: minted.resourceId,
      })
    }
    const printScaffoldEnvLines = () => {
      for (const [file, values] of [
        [
          FRONTEND_ENV_FILE,
          {
            NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
            NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
          },
        ],
        [STUDIO_ENV_FILE, {SANITY_AUTH_TOKEN: minted.token}],
      ] as const) {
        for (const [key, value] of Object.entries(values)) {
          flow.line(`   ${file}: ${key}="${value}"`)
        }
      }
    }
    const printScaffoldRecipe = () => {
      const [studioCommand, frontendCommand] = manualScaffoldCommands({
        dataset: minted.datasetName,
        projectId: minted.resourceId,
      })
      flow.highlight('Create your Studio')
      flow.gap()
      flow.command(studioCommand)
      flow.gap()
      flow.highlight(`Create a new Next.js website in ./${FRONTEND_DIR}`)
      flow.gap()
      flow.command(frontendCommand)
      flow.gap()
      flow.line('then add:')
      flow.gap()
      printScaffoldEnvLines()
    }
    const studioTokenUrl = `http://localhost:3333/#token=${encodeURIComponent(minted.token)}`
    const printStudioInstructions = () => {
      flow.highlight('Start your Studio with:')
      flow.gap()
      flow.command(`cd ${STUDIO_DIR} && npx sanity dev`)
      flow.gap()
      flow.link(studioTokenUrl, {label: 'then open'})
      flow.line('The token in that link signs you in: there is no account yet.')
    }
    const printWebsiteInstructions = (packageManager: ScaffoldResult['frontendPackageManager']) => {
      flow.highlight('In a separate terminal, start your website with:')
      flow.gap()
      flow.command(`cd ${FRONTEND_DIR} && ${frontendDevCommand(packageManager)}`)
      flow.gap()
      flow.link('http://localhost:3000/', {label: 'then open'})
    }

    let warnings: string[] | undefined
    let setupValuesWritten = false
    let envIgnoreRulePresent = false
    let rootEnvProtected = false
    let rootTokenWritten = false
    let rootEnvRecoveryPrinted = false

    if (hasExistingKeys) {
      const message =
        `${existingEnvFiles.join(' and ')} still ${existingEnvFiles.length === 1 ? 'holds' : 'hold'} ` +
        `the previous Sanity values and ${existingEnvFiles.length === 1 ? 'was' : 'were'} not ` +
        'modified; update them from the new values.'
      if (json) {
        warnings = [message]
      } else {
        flow.note(
          `Your existing ${existingEnvFiles.join(' and ')} ${
            existingEnvFiles.length === 1 ? 'was' : 'were'
          } left unchanged.`,
        )
        flow.gap()
        flow.highlight(`Update ${existingEnvFiles.join(' and ')}`)
        flow.line(
          existingEnvFiles.length === 1
            ? 'Replace the previous Sanity values with:'
            : 'Replace the previous Sanity values in both files with:',
        )
        flow.gap()
        printEnvValues()
        flow.gap()
        if (this.flags.scaffold) {
          printScaffoldRecipe()
          flow.gap()
        }
        rootEnvRecoveryPrinted = true
      }
    } else if (!json) {
      try {
        const written = appendEnvValues(envPath, envValues, {
          banner: [
            `Added by \`${invoked}\`: unclaimed Sanity project, expires ${minted.expiresAt}`,
            `Claim it to keep it: ${minted.claimUrl}`,
          ],
        })
        const gitignore = ensureEnvGitignored(cwd, '.env*')
        const envTracked = isEnvTracked(cwd)
        envIgnoreRulePresent = gitignore.ignored
        rootEnvProtected = !envTracked && envIgnoreRulePresent

        if (written.skippedKeys.length > 0) {
          for (const key of written.skippedKeys) {
            flow.highlight(`Update ${key} in ./.env`)
            flow.line('The existing value was left unchanged. Set it to:')
            flow.gap()
            printValues({[key]: envValues[key as keyof typeof envValues]})
            flow.gap()
          }
          rootEnvRecoveryPrinted = true
        }

        setupValuesWritten = SCAFFOLD_REQUIRED_ENV_KEYS.every((key) =>
          written.wroteKeys.includes(key),
        )
        rootTokenWritten = written.wroteKeys.includes('SANITY_AUTH_TOKEN')
        if (!setupValuesWritten) {
          flow.note('./.env did not receive the new project ID, so automatic setup was skipped.')
          if (this.flags.scaffold) {
            flow.gap()
            printScaffoldRecipe()
          }
        }

        if (envTracked) {
          flow.highlight('Keep .env out of version control')
          flow.line('The file is already tracked by Git:')
          flow.gap()
          flow.command('git rm --cached .env')
          flow.gap()
        } else if (!gitignore.ignored) {
          flow.highlight('Keep .env out of version control')
          flow.line('Add .env* to .gitignore before committing.')
          flow.gap()
        }
      } catch (err) {
        flow.note(`Could not write ./.env: ${err instanceof Error ? err.message : err}`)
        flow.gap()
        flow.highlight('Add these values to ./.env')
        flow.gap()
        printEnvValues()
        flow.gap()
        if (this.flags.scaffold) printScaffoldRecipe()
        rootEnvRecoveryPrinted = true
      }
      flow.gap()
    }

    const shouldScaffold = !json && this.flags.scaffold && !hasExistingKeys && setupValuesWritten
    let scaffold: ScaffoldResult | undefined
    if (shouldScaffold) {
      const scaffoldController = new AbortController()
      const abortScaffold = () => scaffoldController.abort(new Error('SIGINT'))
      process.once('SIGINT', abortScaffold)
      try {
        scaffold = await scaffoldProject({
          cancelSignal: scaffoldController.signal,
          dataset: minted.datasetName,
          displayName,
          output,
          projectId: minted.resourceId,
          telemetry: this.telemetry,
          token: minted.token,
          workDir: cwd,
        })
        scaffoldController.signal.throwIfAborted()
      } catch (err) {
        if (
          scaffoldController.signal.aborted ||
          (err instanceof Error && err.message === 'SIGINT')
        ) {
          flow.note('Setup stopped. Your project was still created.')
          flow.line('Claim it before the deadline to keep it.')
          flow.gap()
          flow.link(minted.claimUrl, {label: 'Claim your project:', outro: true})
          throw err
        }
        flow.note(`Automatic setup did not finish: ${err instanceof Error ? err.message : err}`)
        flow.line('The project is ready. You do not need to create another one.')
        flow.gap()
        printScaffoldRecipe()
        flow.gap()
      } finally {
        process.off('SIGINT', abortScaffold)
      }
    }

    if (scaffold) {
      const printFrontendEnv = () => {
        printValues(scaffold.frontendEnv)
      }

      if (scaffold.frontendPath) {
        flow.result('Created two folders')
        flow.line(`./${STUDIO_DIR}: your Studio, where you write and edit content`)
        flow.line(`./${FRONTEND_DIR}: your website, a Next.js app that reads it`)
        flow.gap()
        printStudioInstructions()
        flow.gap()
        printWebsiteInstructions(scaffold.frontendPackageManager)
        if (!scaffold.frontendEnvWritten) {
          flow.gap()
          flow.highlight(`Add these values to ./${FRONTEND_ENV_FILE}`)
          flow.gap()
          printFrontendEnv()
        }
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
        flow.gap()
        const frontendCommand = manualScaffoldCommands({
          dataset: minted.datasetName,
          projectId: minted.resourceId,
        })[1]
        flow.highlight('Create your website')
        flow.gap()
        flow.command(frontendCommand)
        flow.gap()
        flow.line('then add:')
        flow.gap()
        printFrontendEnv()
      }

      if (!scaffold.studioEnvWritten) {
        flow.gap()
        flow.highlight(`Add your access token to ./${STUDIO_ENV_FILE}`)
        flow.gap()
        printValues({SANITY_AUTH_TOKEN: minted.token})
      }
      if (scaffold.frontendDependenciesInstalled === false) {
        flow.gap()
        flow.highlight('Finish installing your website dependencies')
        flow.gap()
        flow.command(
          `cd ${FRONTEND_DIR} && ${frontendInstallCommand(scaffold.frontendPackageManager)}`,
        )
      }
      flow.gap()
    }

    if (recorded === false) {
      flow.note('The local recovery record was not saved.')
      flow.line('Keep the claim URL and access token from this output.')
      flow.gap()
    }

    if (!json) {
      if (!scaffold && !this.flags.scaffold) {
        flow.result('Project created without scaffolding')
        flow.line(
          'No folders were created. Use the project ID and dataset above in your own setup.',
        )
        flow.gap()
      }

      const tokenLocations = [
        ...(rootTokenWritten ? [{isProtected: rootEnvProtected, path: './.env'}] : []),
        ...(scaffold?.studioEnvWritten
          ? [{isProtected: envIgnoreRulePresent, path: `./${STUDIO_ENV_FILE}`}]
          : []),
      ]
      if (tokenLocations.length === 0) {
        flow.note('Your access token is shown above.')
        flow.line(
          rootEnvRecoveryPrinted
            ? 'It was not written over your existing configuration.'
            : 'Keep it out of version control.',
        )
      } else {
        flow.note(
          `Your access token is in ${tokenLocations.map(({path: file}) => file).join(' and ')}`,
        )
        const protectedLocations = tokenLocations.filter(({isProtected}) => isProtected)
        let protection: string
        if (protectedLocations.length === tokenLocations.length) {
          protection =
            tokenLocations.length === 2
              ? 'Both files are kept out of version control for you.'
              : 'That file is kept out of version control for you.'
        } else if (protectedLocations.length === 0) {
          protection =
            tokenLocations.length === 2
              ? 'Keep both files out of version control.'
              : 'Keep that file out of version control.'
        } else {
          const protectedPath = protectedLocations[0]?.path
          const unprotectedPath = tokenLocations.find(({isProtected}) => !isProtected)?.path
          protection = `${protectedPath} is ignored. Keep ${unprotectedPath} out of version control yourself.`
        }
        flow.line(protection)
      }
      flow.gap()
      flow.line(
        'Your content is private until you claim, so anything reading it needs that token. Keep ' +
          'those reads server-side and never expose the token to the browser: it can change ' +
          'everything in this project. Claiming makes your content readable without it.',
      )
      flow.gap()
      flow.line('Framework setup, and what to do after claiming:')
      flow.line(SANITY_NEW_URL)
      flow.gap()
      flow.link(minted.claimUrl, {label: 'Claim your project:', outro: true})
    }

    return toResult(minted, warnings)
  }

  private guardExistingProject(
    envFiles: {displayPath: string; path: string}[],
    invoked: string,
  ): string[] {
    const inspectedFiles = envFiles.map(({displayPath, path: envPath}) => ({
      displayPath,
      inspection: inspectEnvKeys(envPath, GUARDED_ENV_KEYS),
    }))
    const blankValues = inspectedFiles.flatMap(({displayPath, inspection}) =>
      inspection.blankKeys.map((key) => `${displayPath}: ${key}`),
    )

    if (blankValues.length > 0) {
      throw new CLIError(
        'This directory contains blank Sanity project placeholders: ' +
          `${blankValues.join(', ')}. No project was minted.`,
        {
          code: 'BLANK_SANITY_ENV_VALUES',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `Remove those blank lines, or populate them, before running \`${invoked}\``,
          ],
        },
      )
    }

    const existingFiles = inspectedFiles.flatMap(({displayPath, inspection}) => {
      const foundKeys = GUARDED_ENV_KEYS.filter((key) => inspection.values[key] !== undefined)
      return foundKeys.length > 0 ? [{displayPath, foundKeys}] : []
    })
    if (existingFiles.length === 0) return []
    if (this.flags.force) return existingFiles.map(({displayPath}) => displayPath)

    throw new CLIError(
      'This directory already has Sanity project values in ' +
        existingFiles
          .map(({displayPath, foundKeys}) => `${displayPath} (${foundKeys.join(', ')})`)
          .join(' and ') +
        '.',
      {
        code: 'EXISTING_SANITY_ENV_VALUES',
        exit: exitCodes.RUNTIME_ERROR,
        suggestions: [
          `Mint a fresh project anyway: \`${invoked} --force\` (.env is left untouched)`,
          'Or run this command in a different directory',
        ],
      },
    )
  }
}
