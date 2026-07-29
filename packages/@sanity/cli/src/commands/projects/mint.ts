import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {findMintedProjectEnvBoundary} from '@sanity/cli-core/config'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {createFlow, input} from '@sanity/cli-core/ux'

import {
  existingScaffoldEnvFiles,
  FRONTEND_DIR,
  FRONTEND_ENV_FILE,
  manualScaffoldCommands,
  scaffoldProject,
  type ScaffoldResult,
  STUDIO_DIR,
  STUDIO_ENV_FILE,
} from '../../actions/scaffold/scaffoldProject.js'
import {lookupClaimState, mintUnclaimedProject} from '../../services/mintProject.js'
import {
  forgetMintedProject,
  formatMsLeft,
  getMintedProjectRecord,
  recordMintedProject,
} from '../../util/claimNudges.js'
import {
  appendEnvValues,
  ensureEnvGitignored,
  GUARDED_ENV_KEYS,
  inspectEnvKeys,
  isEnvTracked,
  TOKEN_ENV_FILES,
} from '../../util/envFile.js'
import {CLAIM_WINDOW_HOURS, SANITY_NEW_URL} from '../../util/mintProjectConstants.js'
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'

const SCAFFOLD_REQUIRED_ENV_KEYS = ['SANITY_PROJECT_ID'] as const

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

function describeExpiry(expiresAt: string | undefined): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return `, expiring in ${formatMsLeft(ms)} (${expiresAt})`
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

function claimTokenFromClaimUrl(claimUrl: string | undefined): string | undefined {
  if (!claimUrl) return undefined
  try {
    return new URL(claimUrl).pathname.split('/').findLast(Boolean)
  } catch {
    return undefined
  }
}

interface GuardResult {
  /** Whether `.env` already held managed keys — when true, new credentials are printed, not written. */
  hasExistingKeys: boolean

  /** Verified-expired project id the new mint supersedes (drop its ledger record). */
  expiredProjectId?: string
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

export class MintProjectCommand extends SanityCommand<typeof MintProjectCommand> {
  static override args = {
    projectName: Args.string({
      description: 'Display name for the minted project',
      required: false,
    }),
  }

  static override description =
    'Mint an unclaimed Sanity project without logging in.\n' +
    '\n' +
    `By default, it scaffolds ./${STUDIO_DIR}, a Studio for editing content, and ` +
    `./${FRONTEND_DIR}, a connected Next.js website. Use --no-scaffold to mint only the project.\n` +
    '\n' +
    'Credentials are written to ./.env, which is gitignored, and to a local ledger used for CLI ' +
    'authentication and claim reminders. Commands that need a project id still read it from a ' +
    'Sanity config file or --project-id, so run them inside the scaffolded Studio. With --json, ' +
    'the command writes no files, creates no scaffold or ledger entry, and returns a ' +
    'machine-readable credential payload.\n' +
    '\n' +
    `The project must be claimed with a Sanity account within ${CLAIM_WINDOW_HOURS} hours or the ` +
    'project and all its content are permanently deleted. The claim URL is single-use; whoever ' +
    'opens it becomes the owner. If you are an agent: give the full claim URL to the person you ' +
    'are working for immediately. They must open it themselves before the deadline.\n' +
    '\n' +
    'The robot token has full content access: it can create, edit, and publish content and deploy ' +
    'schemas. It cannot deploy a hosted Studio, create datasets, or manage project settings. ' +
    'Before claim, dataset reads are private and must use the token server-side; never expose it ' +
    'to browser code. Claiming makes the dataset public and readable without the token.\n' +
    '\n' +
    `After the claim, run \`sanity login\` and remove SANITY_AUTH_TOKEN from ${TOKEN_ENV_FILES} ` +
    'to act as your own account. The robot token remains active until you remove it.\n' +
    '\n' +
    'Minting is rate-limited per machine. Framework setup and post-claim cleanup: ' +
    `${SANITY_NEW_URL}.`

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
        'Mint a new project even when .env already has Sanity credentials (the file is left untouched; the new values are printed for you to apply)',
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

  public async run(): Promise<MintProjectResult> {
    // Under `--json` oclif suppresses `this.log` and prints the returned result instead, so the
    // narrated flow only appears in human runs and JSON mode never writes to the filesystem.
    const {output} = this
    const json = this.jsonEnabled()
    const flow = createFlow(output.log)
    // How this command was invoked (`sanity new` vs `sanity projects mint`).
    const invoked = [this.config.bin, ...(this.id?.split(':') ?? [])].join(' ')

    const cwd = process.cwd()
    // Guard against the same nearest credential boundary used by CLI authentication, but keep
    // first-mint writes rooted at the invocation directory.
    const envPath = path.join(cwd, '.env')
    const guardEnvPath = findMintedProjectEnvBoundary(cwd)?.envPath ?? envPath
    const guard: GuardResult = await this.guardExistingProject(guardEnvPath, invoked)
    const guardDirectory = path.dirname(guardEnvPath)
    const guardIsCurrentDirectory = path.resolve(guardDirectory) === path.resolve(cwd)
    const guardEnvReference = guardIsCurrentDirectory ? './.env' : path.relative(cwd, guardEnvPath)
    const guardJsonEnvReference = guardIsCurrentDirectory ? '.env' : guardEnvReference
    const guardScopedReference = (relativePath: string) =>
      guardIsCurrentDirectory
        ? relativePath
        : path.relative(cwd, path.join(guardDirectory, relativePath))

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

    if (!json) {
      if (guard.expiredProjectId) {
        flow.note(
          guardIsCurrentDirectory
            ? `Found an expired unclaimed project (${guard.expiredProjectId}) in .env. Minting a replacement; your .env is left untouched and new values follow.`
            : `Found an expired unclaimed project (${guard.expiredProjectId}) in ${guardEnvReference}. Minting a replacement; ${guardEnvReference} is left untouched and new values follow.`,
        )
      } else if (guard.hasExistingKeys) {
        flow.note(
          guardIsCurrentDirectory
            ? '--force: minting a new project. Your .env is left untouched; new values follow.'
            : `--force: minting a new project. ${guardEnvReference} is left untouched; new values follow.`,
        )
      }
      if (guard.hasExistingKeys) flow.gap()
    }

    const spin = json ? undefined : flow.spin('Minting your project...')
    let minted
    try {
      minted = await mintUnclaimedProject({displayName})
    } catch (err) {
      spin?.fail('Minting your project failed.')
      throw err
    }
    // `--json` writes nothing (no `.env` either), so it must not touch the ledger — the caller owns
    // the returned token. Only the interactive path records, and so keeps showing unclaimed nudges
    // until claim or expiry (e.g. for a `--force`-superseded live project that may hold content).
    const recorded = json ? undefined : recordMintedProject(minted)
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
        'Until then it is temporary — the project and everything in it is permanently deleted ' +
          'at that deadline. Claiming is free, takes about a minute, and nothing you have built changes.',
      )
      flow.line(
        'Treat the link like a password: it is single-use, and whoever opens it becomes the owner.',
      )
      flow.gap()
      flow.note(
        styleText(
          'dim',
          'If you are an agent: give this claim URL to the person you are working for.',
        ),
      )
      flow.line(styleText('dim', 'They have to open it themselves before the deadline.'))
      flow.gap()
    }

    const envValues = {
      SANITY_AUTH_TOKEN: minted.token,
      SANITY_DATASET: minted.datasetName,
      SANITY_PROJECT_ID: minted.resourceId,
    }
    const printEnvValues = () => {
      flow.line(`SANITY_PROJECT_ID="${minted.resourceId}"`)
      flow.line(`SANITY_DATASET="${minted.datasetName}"`)
      flow.line(`SANITY_AUTH_TOKEN="${minted.token}"`)
    }
    const scaffoldEnvKeys: Record<string, [key: string, value: string][]> = {
      [FRONTEND_ENV_FILE]: [
        ['NEXT_PUBLIC_SANITY_PROJECT_ID', minted.resourceId],
        ['NEXT_PUBLIC_SANITY_DATASET', minted.datasetName],
      ],
      [STUDIO_ENV_FILE]: [['SANITY_AUTH_TOKEN', minted.token]],
    }
    const printScaffoldEnvLines = (
      files: string[],
      displayPath: (file: string) => string = (file) => file,
    ) => {
      for (const file of files) {
        for (const [key, value] of scaffoldEnvKeys[file] ?? []) {
          flow.line(`${displayPath(file)}: ${key}="${value}"`)
        }
      }
    }
    const describeScaffoldEnvKeys = (
      files: string[],
      displayPath: (file: string) => string = (file) => file,
    ) =>
      files
        .map(
          (file) =>
            `${displayPath(file)} (${(scaffoldEnvKeys[file] ?? []).map(([key]) => key).join(', ')})`,
        )
        .join(' and ')
    const printScaffoldRecipe = () => {
      for (const command of manualScaffoldCommands({
        dataset: minted.datasetName,
        projectId: minted.resourceId,
      })) {
        flow.line(command)
      }
      flow.line('Then add:')
      printScaffoldEnvLines(Object.keys(scaffoldEnvKeys))
    }
    let warnings: MintProjectResult['warnings']
    let credentialsOnDisk = false
    let envProtected = false
    let rootTokenWritten = false

    if (guard.hasExistingKeys) {
      const staleScaffoldEnv = existingScaffoldEnvFiles(guardDirectory)

      if (json) {
        warnings = [
          `${guardJsonEnvReference} still holds the previous Sanity values and was not modified (this command ` +
            'never edits existing lines); update it from this payload.',
          ...(staleScaffoldEnv.length > 0
            ? [
                `${describeScaffoldEnvKeys(staleScaffoldEnv, guardScopedReference)} still hold superseded values; ` +
                  `update them from this payload too, and keep the token out of ${guardScopedReference(FRONTEND_ENV_FILE)}.`,
              ]
            : []),
        ]
      } else {
        flow.highlight(
          `Update ${guardEnvReference} yourself, replacing the old Sanity values with these:`,
        )
        printEnvValues()
        flow.gap()
        if (staleScaffoldEnv.length > 0) {
          flow.note(
            `${staleScaffoldEnv.map((file) => guardScopedReference(file)).join(' and ')} still hold superseded values, so update them too:`,
          )
          printScaffoldEnvLines(staleScaffoldEnv, guardScopedReference)
          flow.gap()
        }
        if (this.flags.scaffold) {
          flow.note(
            `Skipping the automatic scaffold because ${guardEnvReference} still points at the previous project.${
              staleScaffoldEnv.length === 0
                ? ' After replacing those values, scaffold with:'
                : ' Update the existing scaffold values above before using it.'
            }`,
          )
          if (staleScaffoldEnv.length === 0) printScaffoldRecipe()
          flow.gap()
        }
      }

      if (guard.expiredProjectId && !forgetMintedProject(guard.expiredProjectId)) {
        const notDropped =
          `Couldn't update the local project registry: expired project ${guard.expiredProjectId} ` +
          'is still recorded, so re-running this command will mint another project against the rate limit.'
        if (json) {
          warnings = [...(warnings ?? []), notDropped]
        } else {
          this.output.warn(notDropped)
        }
      }
    } else if (!json) {
      try {
        const written = appendEnvValues(envPath, envValues, {
          banner: [
            `Added by \`${invoked}\`: unclaimed Sanity project, expires ${minted.expiresAt}`,
            `Claim it to keep it: ${minted.claimUrl}`,
          ],
        })
        // `.env` carries the robot token whether we wrote it now or it was already present
        // (skipped) — gitignore it either way, not just when keys were written this run.
        const gitignore = ensureEnvGitignored(process.cwd(), '.env*')
        // Gitignore does nothing for an already-tracked file, so a tracked `.env` can still be
        // committed — check before claiming the token is protected.
        const envTracked = isEnvTracked(process.cwd())
        envProtected = !envTracked && gitignore.ignored
        if (written.skippedKeys.length > 0) {
          flow.note(`./.env already has ${written.skippedKeys.join(', ')}; make sure they read:`)
          for (const key of written.skippedKeys) {
            flow.line(`${key}="${envValues[key as keyof typeof envValues]}"`)
          }
        }
        credentialsOnDisk = SCAFFOLD_REQUIRED_ENV_KEYS.every((key) =>
          written.wroteKeys.includes(key),
        )
        rootTokenWritten = written.wroteKeys.includes('SANITY_AUTH_TOKEN')
        if (!credentialsOnDisk) {
          flow.note(
            `Skipping the ${STUDIO_DIR}/ and ${FRONTEND_DIR}/ scaffold: the lines above shadowed ` +
              'the values, so ./.env carries no usable credentials and nothing here can ' +
              'authenticate. Set them to the values shown, then scaffold with:',
          )
          printScaffoldRecipe()
        }
        if (envTracked) {
          this.output.warn(
            '.env is already tracked by git; adding it to .gitignore does not untrack it, so the ' +
              'token can still be committed. Run `git rm --cached .env` to stop tracking it.',
          )
        } else if (gitignore.added) {
          flow.line('Added .env* to .gitignore so the token stays out of git.')
        } else if (!gitignore.ignored) {
          // The write failed — .env now holds a token but may not be ignored. Never silent.
          this.output.warn(
            "Couldn't add .env* to .gitignore; add it yourself so the robot token in .env is never committed.",
          )
        }
      } catch (err) {
        this.warn(`Couldn't write ./.env (${err instanceof Error ? err.message : err})`)
        // The token and claim details are still recoverable from the local project registry;
        // don't claim otherwise. Add them to .env yourself, and keep .env out of git.
        flow.highlight('Add these to ./.env yourself, and keep .env out of git:')
        printEnvValues()
        flow.note(
          `Skipping the ${STUDIO_DIR}/ and ${FRONTEND_DIR}/ scaffold: ./.env is what makes this ` +
            'directory authenticate, so scaffolding without it would leave a project that cannot ' +
            'read its own content. Write ./.env, then scaffold with:',
        )
        printScaffoldRecipe()
      }
      flow.gap()
    }

    const shouldScaffold =
      !json && this.flags.scaffold && !guard.hasExistingKeys && credentialsOnDisk
    let scaffold: ScaffoldResult | undefined
    let scaffoldFailed = false
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
          workDir: process.cwd(),
        })
        scaffoldController.signal.throwIfAborted()
      } catch (err) {
        scaffoldController.signal.throwIfAborted()
        if (err instanceof Error && err.message === 'SIGINT') throw err
        this.output.warn(
          `Couldn't scaffold the project (${err instanceof Error ? err.message : err}). ` +
            'Your project is minted and ./.env is written, so nothing needs re-minting.',
        )
        scaffoldFailed = true
        flow.note('Scaffold it yourself with:')
        printScaffoldRecipe()
      } finally {
        process.off('SIGINT', abortScaffold)
      }
    }

    if (scaffold) {
      for (const warning of scaffold.warnings) this.output.warn(warning)
      const printFrontendEnv = () => {
        for (const [key, value] of Object.entries(scaffold.frontendEnv)) {
          flow.line(`${key}="${value}"`)
        }
        if (scaffold.detectedFramework && !scaffold.frontendEnvPrefix) {
          flow.line(
            `These fallback values use NEXT_PUBLIC_. Translate that public prefix for ${scaffold.detectedFramework} before using them.`,
          )
        }
      }
      const studioTokenUrl = `http://localhost:3333/#token=${encodeURIComponent(minted.token)}`
      const printStudioInstructions = () => {
        flow.line(`cd ${STUDIO_DIR} && npx sanity dev`)
        flow.line('then open')
        flow.link(studioTokenUrl)
        flow.line('the token in that link signs you in — there is no account yet')
      }

      if (scaffold.frontendPath) {
        flow.highlight('Created two folders')
        flow.line(`./${STUDIO_DIR} — your Studio, where you write and edit content`)
        flow.line(`./${FRONTEND_DIR} — your website, a Next.js app that reads it`)
        flow.gap()
        printStudioInstructions()
        flow.line(`cd ${FRONTEND_DIR} && ${frontendDevCommand(scaffold.frontendPackageManager)}`)
        flow.line('then open http://localhost:3000/')
        if (!scaffold.frontendEnvWritten) {
          flow.line(`./${FRONTEND_DIR}/.env.local wasn't written. Add these yourself:`)
          printFrontendEnv()
        }
      } else if (scaffold.detectedFramework) {
        flow.highlight(
          `Created ./${STUDIO_DIR} for your existing ${scaffold.detectedFramework} app`,
        )
        flow.line(`./${STUDIO_DIR} — your Studio, where you write and edit content`)
        flow.line(`Your existing ${scaffold.detectedFramework} frontend was left unchanged.`)
        flow.gap()
        printStudioInstructions()
        flow.line('Add these to your app:')
        printFrontendEnv()
      } else {
        flow.highlight(`Created ./${STUDIO_DIR}; the frontend was not created`)
        flow.line(`./${STUDIO_DIR} — your Studio, where you write and edit content`)
        flow.gap()
        printStudioInstructions()
        flow.line('Scaffold a frontend yourself, then add these:')
        printFrontendEnv()
      }
      flow.gap()
    }

    if (recorded === false) {
      // Root commands can recover the token from .env, but claim reminders need the ledger.
      const msg =
        "Couldn't save this project to the local registry, so automatic claim reminders won't " +
        'include it. Commands in this directory can still authenticate from ./.env.'
      if (json) warnings = [...(warnings ?? []), msg]
      else this.output.warn(msg)
    }

    if (!json) {
      if (!scaffold && !this.flags.scaffold) {
        flow.highlight('Project created without scaffolding')
        flow.line(
          'No folders were created. Use the project ID and dataset above in your own setup.',
        )
        flow.gap()
      } else if (scaffoldFailed) {
        flow.highlight('The project is ready; automatic scaffolding did not finish')
        flow.line('No re-mint is needed. Use the manual commands above to finish the setup.')
        flow.gap()
      }

      const studioEnvFailed = scaffold?.warnings.some((warning) =>
        warning.includes(`Couldn't write ${STUDIO_ENV_FILE}`),
      )
      const tokenLocations = [
        ...(rootTokenWritten ? ['./.env'] : []),
        ...(scaffold && !studioEnvFailed ? [`./${STUDIO_ENV_FILE}`] : []),
      ]
      if (tokenLocations.length === 0) {
        flow.highlight('Protect the replacement access token printed above')
        flow.line('It was not written over your existing configuration.')
      } else {
        flow.highlight(`Your access token is in ${tokenLocations.join(' and ')}`)
        if (envProtected && tokenLocations.length === 2) {
          flow.line('Both files are kept out of version control for you.')
        } else if (!rootTokenWritten || envProtected) {
          flow.line('That file is kept out of version control for you.')
        } else if (tokenLocations.length === 2) {
          flow.line(`./${STUDIO_ENV_FILE} is ignored; keep ./.env out of version control yourself.`)
        } else {
          flow.line('Keep that file out of version control.')
        }
        if (!rootTokenWritten) {
          flow.line(
            './.env kept its existing token; use the replacement value printed above when you update it.',
          )
        }
      }
      flow.line(
        'The token can read and change everything in this project. Never copy it into code that runs in a browser.',
      )
      flow.gap()
      flow.line(
        'Your content is private until you claim, so anything reading it needs that token. Keep those reads server-side.',
      )
      flow.line('Claiming makes the dataset public and readable without the token.')
      flow.gap()
      flow.line(`Framework setup and what to do after claiming: ${SANITY_NEW_URL}`)
      flow.gap()
      flow.link(minted.claimUrl, {label: 'Claim your project:', outro: true})
    }

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

  private async guardExistingProject(envPath: string, invoked: string): Promise<GuardResult> {
    const cwdEnvPath = path.join(process.cwd(), '.env')
    const isCurrentDirectoryEnv = path.resolve(envPath) === path.resolve(cwdEnvPath)
    const envReference = isCurrentDirectoryEnv ? '.env' : path.relative(process.cwd(), envPath)
    const envSubject = isCurrentDirectoryEnv
      ? "This directory's .env"
      : `The ancestor ${envReference}`
    const scopeSubject = isCurrentDirectoryEnv ? 'This directory' : envSubject
    const replacementDetail = isCurrentDirectoryEnv
      ? 'the unclaimed project lives on until it expires'
      : `${envReference} is left untouched; the unclaimed project lives on until it expires`
    const tokenEnvFiles = isCurrentDirectoryEnv
      ? TOKEN_ENV_FILES
      : `${envReference} or ${path.relative(
          process.cwd(),
          path.join(path.dirname(envPath), STUDIO_ENV_FILE),
        )}`
    const differentScopeSuggestion = isCurrentDirectoryEnv
      ? 'Or run this command in a different directory'
      : `Or run this command outside the project scope established by ${envReference}`
    const inspection = inspectEnvKeys(envPath, GUARDED_ENV_KEYS)

    // A blank `KEY=` line is invisible to the value read but still owns the line for the writer,
    // so the new credentials could never be persisted. Refuse (even with --force, which never
    // edits existing lines either) before spending a mint or touching the filesystem.
    if (inspection.blankKeys.length > 0) {
      throw new CLIError(
        `${envSubject} contains blank Sanity credential placeholders: ` +
          `${inspection.blankKeys.join(', ')}. No project was minted.`,
        {
          code: 'BLANK_SANITY_ENV_VALUES',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `Remove those blank lines from ${envReference}, or populate them, before running \`${invoked}\``,
          ],
        },
      )
    }

    const existing = inspection.values
    const foundKeys = GUARDED_ENV_KEYS.filter((key) => existing[key] !== undefined)
    if (foundKeys.length === 0) return {hasExistingKeys: false}
    if (this.flags.force) {
      return {hasExistingKeys: true}
    }

    const projectId = existing.SANITY_PROJECT_ID
    const record = projectId ? getMintedProjectRecord(projectId) : undefined
    const boundToken = record?.claimToken
    const claimToken = boundToken ?? claimTokenFromClaimUrl(existing.SANITY_CLAIM_URL)
    const lookup = claimToken ? await lookupClaimState(claimToken, {timeoutMs: 3000}) : undefined

    if (lookup?.state === 'expired' && boundToken) {
      return {expiredProjectId: projectId, hasExistingKeys: true}
    }

    if (lookup?.state === 'claimed' && boundToken) {
      throw new CLIError(
        `${envSubject} points at ${projectId ? `Sanity project ${projectId}` : 'a Sanity project'}, which has already been claimed.`,
        {
          code: 'CLAIMED_PROJECT_IN_ENV',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `If it is yours: run \`sanity login\`, then remove SANITY_AUTH_TOKEN from ${tokenEnvFiles} to act as yourself`,
            `Mint a fresh project here anyway: \`${invoked} --force\` (${envReference} is left untouched)`,
          ],
        },
      )
    }

    const claimUrl = record?.claimUrl ?? existing.SANITY_CLAIM_URL
    if (lookup?.state === 'claimable' || record) {
      // Only continue when project expiry verified server-side.
      const expiresAt = lookup ? (lookup.expiresAt ?? undefined) : record?.expiresAt
      throw new CLIError(
        `${scopeSubject} already has an unclaimed Sanity project${projectId ? ` (${projectId})` : ''}${describeExpiry(expiresAt ?? undefined)}.`,
        {
          code: 'UNCLAIMED_PROJECT_IN_ENV',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            ...(claimUrl ? [`Claim it to keep it: ${claimUrl}`] : []),
            `Mint a replacement anyway: \`${invoked} --force\` (${replacementDetail})`,
          ],
        },
      )
    }

    // Managed keys present, but nothing verifies what they belong to.
    throw new CLIError(`${envSubject} already has Sanity credentials (${foundKeys.join(', ')}).`, {
      code: 'UNVERIFIED_SANITY_CREDENTIALS',
      exit: exitCodes.RUNTIME_ERROR,
      suggestions: [
        `Mint a fresh project anyway: \`${invoked} --force\` (${envReference} is left untouched)`,
        differentScopeSuggestion,
      ],
    })
  }
}
