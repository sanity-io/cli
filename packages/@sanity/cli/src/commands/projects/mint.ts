import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
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
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'
import {hyperlink} from '../../util/terminalLink.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'

const SCAFFOLD_REQUIRED_ENV_KEYS = ['SANITY_PROJECT_ID'] as const

function describeExpiry(expiresAt: string | undefined): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return `, expiring in ${formatMsLeft(ms)} (${expiresAt})`
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
    'Credentials are written to ./.env (SANITY_PROJECT_ID, SANITY_DATASET, and ' +
    'SANITY_AUTH_TOKEN, a robot token) and .env is gitignored, so `sanity` commands here ' +
    'authenticate as the project with no account. Commands that need a project id still take it ' +
    'from a Sanity config file or --project-id, so run them inside the scaffolded Studio folder. ' +
    'Use --json for a machine-readable payload instead: JSON mode writes no files and the caller ' +
    'owns the credentials.\n' +
    '\n' +
    'Claiming: the project must be claimed with a Sanity account within 72 hours (expiresAt) or ' +
    'it is permanently deleted, content included. The claim URL is single-use and whoever opens ' +
    "it takes ownership: keep it out of git and shared channels. If you're an agent, surface the link to the end user " +
    "immediately. Everything keeps working after you've claimed, including the robot token.\n" +
    '\n' +
    'The robot token has full content access to this project: create, edit, publish, and deploy ' +
    'schemas. It cannot deploy a hosted Studio, create datasets, or manage settings. The dataset ' +
    'is private pre-claim: frontend reads must run server-side, and the token must never sit ' +
    'under a client-exposed prefix like NEXT_PUBLIC_* or SANITY_STUDIO_*.\n' +
    '\n' +
    `After the claim, run \`sanity login\` and remove SANITY_AUTH_TOKEN from ${TOKEN_ENV_FILES} ` +
    'to act as your own account; until then, CLI commands in this directory keep ' +
    'authenticating as the robot.\n' +
    '\n' +
    'Minting is rate-limited per machine. Fetch https://sanity.new for agent instructions.'

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
      description: `Scaffold a Studio into ./${STUDIO_DIR} and a Next.js frontend into ./${FRONTEND_DIR} after minting`,
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

    const envPath = path.join(process.cwd(), '.env')
    const guard: GuardResult = await this.guardExistingProject(envPath, invoked)

    renderNewCommandSplash(output.log)

    flow.intro("Let's get you set up with a Sanity project.")
    flow.gap()

    if (!this.isUnattended()) {
      flow.note(
        `${styleText('cyan', `${invoked} --yes`)} for a non-interactive flow with defaults.`,
      )
      flow.gap()
    }

    let displayName = this.args.projectName?.trim()
    if (displayName) {
      flow.result(`Project name: ${styleText('cyan', displayName)}`)
      flow.gap()
    } else if (this.isUnattended()) {
      displayName = DEFAULT_PROJECT_NAME
      flow.result(
        `Project name: ${styleText('cyan', displayName)} ${styleText('dim', '(default)')}`,
      )
      flow.gap()
    } else {
      displayName =
        (await input({default: DEFAULT_PROJECT_NAME, message: 'Project name'})).trim() ||
        DEFAULT_PROJECT_NAME
    }

    if (!json) {
      if (guard.expiredProjectId) {
        flow.note(
          `Found an expired unclaimed project (${guard.expiredProjectId}) in .env. Minting a replacement; your .env is left untouched and new values follow.`,
        )
      } else if (guard.hasExistingKeys) {
        flow.note('--force: minting a new project. Your .env is left untouched; new values follow.')
      } else {
        flow.note('No Sanity credentials in .env yet, adding them.')
      }
      flow.gap()
    }

    const spin = json ? undefined : flow.spin('Minting your project...')
    let minted
    try {
      minted = await mintUnclaimedProject({displayName})
    } catch (err) {
      spin?.fail('Minting your project failed.')
      throw err
    }
    spin?.succeed('Project minted')

    // `--json` writes nothing (no `.env` either), so it must not touch the ledger — the caller owns
    // the returned token. Only the interactive path records, and so keeps showing unclaimed nudges
    // until claim or expiry (e.g. for a `--force`-superseded live project that may hold content).
    const recorded = json ? undefined : recordMintedProject(minted)

    flow.gap()
    flow.result(`Project ID: ${styleText('cyan', minted.resourceId)}`)
    flow.result(`Dataset:    ${styleText('cyan', minted.datasetName)}`)
    flow.gap()

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
    const printScaffoldEnvLines = (files: string[]) => {
      for (const file of files) {
        for (const [key, value] of scaffoldEnvKeys[file] ?? []) {
          flow.line(`${file}: ${key}="${value}"`)
        }
      }
    }
    const describeScaffoldEnvKeys = (files: string[]) =>
      files
        .map((file) => `${file} (${(scaffoldEnvKeys[file] ?? []).map(([key]) => key).join(', ')})`)
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

    if (guard.hasExistingKeys) {
      const staleScaffoldEnv = existingScaffoldEnvFiles(process.cwd())

      if (json) {
        warnings = [
          '.env still holds the previous Sanity values and was not modified (this command ' +
            'never edits existing lines); update it from this payload.',
          ...(staleScaffoldEnv.length > 0
            ? [
                `${describeScaffoldEnvKeys(staleScaffoldEnv)} still hold superseded values; ` +
                  `update them from this payload too, and keep the token out of ${FRONTEND_DIR}/.env.local.`,
              ]
            : []),
        ]
      } else {
        flow.highlight('Update ./.env yourself, replacing the old Sanity values with these:')
        printEnvValues()
        flow.gap()
        if (staleScaffoldEnv.length > 0) {
          flow.note(
            `${staleScaffoldEnv.join(' and ')} still hold superseded values, so update them too:`,
          )
          printScaffoldEnvLines(staleScaffoldEnv)
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
        if (written.wroteKeys.length > 0) {
          flow.highlight(`Saved credentials to ./.env as ${written.wroteKeys.join(', ')}`)
        }
        if (written.skippedKeys.length > 0) {
          flow.note(`./.env already has ${written.skippedKeys.join(', ')}; make sure they read:`)
          for (const key of written.skippedKeys) {
            flow.line(`${key}="${envValues[key as keyof typeof envValues]}"`)
          }
        }
        credentialsOnDisk = SCAFFOLD_REQUIRED_ENV_KEYS.every((key) =>
          written.wroteKeys.includes(key),
        )
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
    if (shouldScaffold) {
      try {
        scaffold = await scaffoldProject({
          dataset: minted.datasetName,
          displayName,
          output,
          projectId: minted.resourceId,
          telemetry: this.telemetry,
          token: minted.token,
          workDir: process.cwd(),
        })
      } catch (err) {
        this.output.warn(
          `Couldn't scaffold the project (${err instanceof Error ? err.message : err}). ` +
            'Your project is minted and ./.env is written, so nothing needs re-minting.',
        )
        flow.note('Scaffold it yourself with:')
        printScaffoldRecipe()
      }
    }

    if (scaffold) {
      for (const warning of scaffold.warnings) this.output.warn(warning)
      flow.gap()
      const printFrontendEnv = () => {
        for (const [key, value] of Object.entries(scaffold.frontendEnv)) {
          flow.line(`${key}="${value}"`)
        }
        if (scaffold.detectedFramework && scaffold.detectedFramework !== 'Next.js') {
          flow.line(
            `Those names follow the Next.js convention. On ${scaffold.detectedFramework}, use its ` +
              'own public prefix for the project id and dataset.',
          )
        }
      }

      if (scaffold.frontendPath) {
        flow.highlight(`Created ./${STUDIO_DIR} (Studio) and ./${FRONTEND_DIR} (frontend).`)
        flow.line(`cd ${STUDIO_DIR} && npx sanity dev    to start the Studio on port 3333`)
        flow.line(`cd ${FRONTEND_DIR} && npm run dev     to start the frontend on port 3000`)
        if (!scaffold.frontendEnvWritten) {
          flow.line(`./${FRONTEND_DIR}/.env.local wasn't written. Add these yourself:`)
          printFrontendEnv()
        }
      } else if (scaffold.detectedFramework) {
        flow.highlight(
          `Found ${scaffold.detectedFramework} here, so only ./${STUDIO_DIR} was created.`,
        )
        flow.line('Add these to your app:')
        printFrontendEnv()
      } else {
        flow.highlight(`Created ./${STUDIO_DIR} (Studio). The frontend was not created.`)
        flow.line(`cd ${STUDIO_DIR} && npx sanity dev    to start the Studio on port 3333`)
        flow.line('Scaffold a frontend yourself, then add these:')
        printFrontendEnv()
      }
      flow.gap()
      flow.note(
        'Your dataset is private until you claim it, so reading content from your frontend needs a ' +
          'token. Copy SANITY_AUTH_TOKEN from ./.env when you add those reads, keep them ' +
          'server-side, and never put it under a browser-exposed prefix like NEXT_PUBLIC_ or ' +
          'SANITY_STUDIO_: that publishes a credential with full write access.',
      )
      flow.gap()
    }

    if (recorded === false) {
      // The ledger is how `sanity` commands here authenticate before a config file exists; a failed
      // write must never hide behind mint's success.
      const msg =
        "Couldn't save this project to the local registry; sanity commands in this directory may " +
        'not authenticate until you set SANITY_AUTH_TOKEN from .env, add a Sanity config, or claim the project.'
      if (json) warnings = [...(warnings ?? []), msg]
      else this.output.warn(msg)
    }

    flow.note(
      `You must claim this project within ${styleText('yellow', '72 hours')} (by ${minted.expiresAt}) ` +
        'or your project will be deleted.',
    )
    flow.line("Project credentials keep working after you've claimed.")
    flow.line(hyperlink(styleText('cyan', minted.claimUrl), minted.claimUrl))
    flow.gap()
    flow.note(
      styleText('dim', 'If an agent is running this, surface the full claim URL to the user.'),
    )
    flow.line(
      styleText('dim', 'They need to click this link to claim the project before it expires.'),
    )
    flow.gap()
    flow.outro('Tell your agent to fetch https://sanity.new for instructions on what to do next.')

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
    const inspection = inspectEnvKeys(envPath, GUARDED_ENV_KEYS)

    // A blank `KEY=` line is invisible to the value read but still owns the line for the writer,
    // so the new credentials could never be persisted. Refuse (even with --force, which never
    // edits existing lines either) before spending a mint or touching the filesystem.
    if (inspection.blankKeys.length > 0) {
      throw new CLIError(
        `This directory's .env contains blank Sanity credential placeholders: ` +
          `${inspection.blankKeys.join(', ')}. No project was minted.`,
        {
          code: 'BLANK_SANITY_ENV_VALUES',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `Remove those blank lines from .env, or populate them, before running \`${invoked}\``,
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
        `This directory's .env points at ${projectId ? `Sanity project ${projectId}` : 'a Sanity project'}, which has already been claimed.`,
        {
          code: 'CLAIMED_PROJECT_IN_ENV',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            `If it is yours: run \`sanity login\`, then remove SANITY_AUTH_TOKEN from ${TOKEN_ENV_FILES} to act as yourself`,
            `Mint a fresh project here anyway: \`${invoked} --force\` (.env is left untouched)`,
          ],
        },
      )
    }

    const claimUrl = record?.claimUrl ?? existing.SANITY_CLAIM_URL
    if (lookup?.state === 'claimable' || record) {
      // Only continue when project expiry verified server-side.
      const expiresAt = lookup ? (lookup.expiresAt ?? undefined) : record?.expiresAt
      throw new CLIError(
        `This directory already has an unclaimed Sanity project${projectId ? ` (${projectId})` : ''}${describeExpiry(expiresAt ?? undefined)}.`,
        {
          code: 'UNCLAIMED_PROJECT_IN_ENV',
          exit: exitCodes.RUNTIME_ERROR,
          suggestions: [
            ...(claimUrl ? [`Claim it to keep it: ${claimUrl}`] : []),
            `Mint a replacement anyway: \`${invoked} --force\` (the unclaimed project lives on until it expires)`,
          ],
        },
      )
    }

    // Managed keys present, but nothing verifies what they belong to.
    throw new CLIError(
      `This directory's .env already has Sanity credentials (${foundKeys.join(', ')}).`,
      {
        code: 'UNVERIFIED_SANITY_CREDENTIALS',
        exit: exitCodes.RUNTIME_ERROR,
        suggestions: [
          `Mint a fresh project anyway: \`${invoked} --force\` (.env is left untouched)`,
          'Or run this command in a different directory',
        ],
      },
    )
  }
}
