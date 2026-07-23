import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {createFlow, input} from '@sanity/cli-core/ux'

import {lookupClaimState, mintUnclaimedProject} from '../../services/mintProject.js'
import {
  forgetMintedProject,
  getMintedProjectRecord,
  recordMintedProject,
} from '../../util/claimNudges.js'
import {
  appendEnvValues,
  ensureEnvGitignored,
  GUARDED_ENV_KEYS,
  isEnvTracked,
  readEnvValues,
} from '../../util/envFile.js'
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'
import {hyperlink} from '../../util/terminalLink.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'

function hoursUntil(iso: string): number | undefined {
  const ms = new Date(iso).getTime() - Date.now()
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 3_600_000) : undefined
}

function describeExpiry(expiresAt: string | undefined): string {
  if (!expiresAt) return ''
  const hrs = hoursUntil(expiresAt)
  // A past or imminent date gets no clause: stale local records must not decorate a refusal.
  return hrs ? `, expiring in ~${hrs} hours (${expiresAt})` : ''
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
    'Writes the project id, dataset, and a robot token to .env, so `sanity` commands in this ' +
    'directory run as the project. Claim it with a Sanity account within 72 hours to keep it — ' +
    'everything keeps working after you claim, including the token. Use --json for a ' +
    'machine-readable payload with no files written.'

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
        'Mint a new project even when .env already has Sanity credentials (the file is left untouched — the new values are printed for you to apply)',
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
          `Found an expired unclaimed project (${guard.expiredProjectId}) in .env — minting a replacement. Your .env is left untouched; new values follow.`,
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
    let warnings: MintProjectResult['warnings']

    if (guard.hasExistingKeys) {
      if (json) {
        warnings = [
          '.env still holds the previous Sanity values and was not modified (this command ' +
            'never edits existing lines) — update it from this payload.',
        ]
      } else {
        flow.highlight('Update ./.env yourself — replace the old Sanity values with these:')
        printEnvValues()
        flow.gap()
      }

      if (guard.expiredProjectId && !forgetMintedProject(guard.expiredProjectId)) {
        const notDropped =
          `Couldn't update the local project registry — expired project ${guard.expiredProjectId} ` +
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
            `Added by \`${invoked}\` — unclaimed Sanity project, expires ${minted.expiresAt}`,
            `Claim it to keep it: ${minted.claimUrl}`,
          ],
        })
        // `.env` carries the robot token whether we wrote it now or it was already present
        // (skipped) — gitignore it either way, not just when keys were written this run.
        const gitignore = ensureEnvGitignored(process.cwd())
        // Gitignore does nothing for an already-tracked file, so a tracked `.env` can still be
        // committed — check before claiming the token is protected.
        const envTracked = isEnvTracked(process.cwd())
        if (written.wroteKeys.length > 0) {
          flow.highlight(`Saved credentials to ./.env as ${written.wroteKeys.join(', ')}`)
        }
        if (written.skippedKeys.length > 0) {
          flow.note(`./.env already has ${written.skippedKeys.join(', ')} — make sure they read:`)
          for (const key of written.skippedKeys) {
            flow.line(`${key}="${envValues[key as keyof typeof envValues]}"`)
          }
        }
        if (envTracked) {
          this.output.warn(
            '.env is already tracked by git — adding it to .gitignore does not untrack it, so the ' +
              'token can still be committed. Run `git rm --cached .env` to stop tracking it.',
          )
        } else if (gitignore.added) {
          flow.line(styleText('dim', 'Added .env to .gitignore so the token stays out of git.'))
        } else if (!gitignore.ignored) {
          // The write failed — .env now holds a token but may not be ignored. Never silent.
          this.output.warn(
            "Couldn't add .env to .gitignore — add it yourself so the robot token in .env is never committed.",
          )
        }
      } catch (err) {
        this.warn(`Couldn't write ./.env (${err instanceof Error ? err.message : err})`)
        // The token and claim details are still recoverable from the local project registry;
        // don't claim otherwise. Add them to .env yourself, and keep .env out of git.
        flow.highlight('Add these to ./.env yourself, and keep .env out of git:')
        printEnvValues()
      }
      flow.gap()
    }

    if (recorded === false) {
      // The ledger is how `sanity` commands here authenticate before a config file exists; a failed
      // write must never hide behind mint's success.
      const msg =
        "Couldn't save this project to the local registry — sanity commands in this directory may " +
        'not authenticate until you set SANITY_AUTH_TOKEN from .env, add a Sanity config, or claim the project.'
      if (json) warnings = [...(warnings ?? []), msg]
      else this.output.warn(msg)
    }

    const hrs = hoursUntil(minted.expiresAt)
    flow.note(
      hrs
        ? `Claim your project within ${styleText('yellow', `~${hrs} hours`)} (by ${minted.expiresAt}) to keep it:`
        : `Claim your project before ${styleText('yellow', minted.expiresAt)} to keep it:`,
    )
    flow.line(hyperlink(styleText('cyan', minted.claimUrl), minted.claimUrl))
    flow.gap()
    flow.note('Everything keeps working after you claim, including the token in .env.')
    flow.gap()
    flow.outro('Happy coding')

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
    const existing = readEnvValues(envPath, [...GUARDED_ENV_KEYS])
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
            'If it is yours: run `sanity login`, then remove SANITY_AUTH_TOKEN from .env to act as yourself',
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
