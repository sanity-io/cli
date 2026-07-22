import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {input} from '@sanity/cli-core/ux'

import {lookupClaimState, mintUnclaimedProject} from '../../services/mintProject.js'
import {
  forgetMintedProject,
  getMintedProjectRecord,
  recordMintedProject,
} from '../../util/claimNudges.js'
import {appendEnvValues, readEnvValues} from '../../util/envFile.js'
import {createFlow} from '../../util/flowOutput.js'
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'
import {hyperlink} from '../../util/terminalLink.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'

/**
 * Keys whose presence means this directory already has a project identity, credential, or claim
 * handoff — the things the guardrail exists to protect. `SANITY_DATASET` is deliberately not
 * here: alone (a common template leftover, e.g. an `.env.example` copied with a blank project
 * id) it proves nothing and must not block minting. `SANITY_CLAIM_URL` is read (its last path
 * segment is the claim token, so a directory stays self-contained across machines) but never
 * written by this CLI — the claim URL travels in the banner comment; agents and other tools may
 * set the key themselves.
 */
const GUARDED_ENV_KEYS = ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID', 'SANITY_CLAIM_URL'] as const

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

/** The claim URL's last path segment is the claim token — the capability the lookup needs. */
function claimTokenFromClaimUrl(claimUrl: string | undefined): string | undefined {
  if (!claimUrl) return undefined
  try {
    return new URL(claimUrl).pathname.split('/').findLast(Boolean)
  } catch {
    return undefined
  }
}

/** Outcome of the pre-mint guardrail when minting is allowed to proceed. */
interface GuardResult {
  /**
   * Whether `.env` already held managed keys. The CLI never modifies an existing line, so when
   * true the new credentials are printed (or carried in the JSON payload) with instructions
   * instead of written.
   */
  hasExistingKeys: boolean

  /** Verified-expired project id the new mint supersedes (drop its ledger record). */
  expiredProjectId?: string
}

/**
 * Machine-readable result of the mint flow, emitted as JSON under `--json`. Carries everything a
 * downstream agent needs to act on the project before it is claimed: the scoped robot `token`,
 * the project/dataset identity, the resolved `apiHost`, and the claim handoff (`claimUrl` for a
 * human, `claimApiUrl` + `claimToken` for programmatic claiming).
 */
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

  /** Machine-readable cautions, e.g. a stale `.env` deliberately left unmodified. */
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
    'Mint an unclaimed Sanity project without logging in, and claim it later'

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
    // Under `--json` oclif suppresses `this.log` (which `output.log` is bound to) and prints the
    // returned `MintProjectResult` instead, so the narrated flow only appears in human runs — the
    // structured payload owns stdout in JSON mode, and JSON mode never *writes* to the filesystem
    // (the payload itself carries the credentials).
    const {output} = this
    const json = this.jsonEnabled()
    const flow = createFlow(output.log)
    // How this command was invoked (`sanity new` vs `sanity projects mint`), for self-referencing copy.
    const invoked = [this.config.bin, ...(this.id?.split(':') ?? [])].join(' ')

    const envPath = path.join(process.cwd(), '.env')
    // Guard before anything interactive: a directory that already has a live project should
    // abort before the user invests in a name — and before spending a mint against the
    // provisioning rate cap. This applies to `--json` too: an agent running inside an
    // already-configured directory is the caller most likely to re-mint in a loop, and oclif
    // renders the refusal as a structured `{"error": …}` payload (code + suggestions) there.
    const guard: GuardResult = await this.guardExistingProject(envPath, invoked)

    renderNewCommandSplash(output.log)

    flow.intro("Let's get you set up with a Sanity project.")
    flow.gap()

    // Redundant when the run is already non-interactive — only teach the flag when attended.
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
      // Attended mode: the one decision worth a prompt. `--yes` (or a non-TTY) skips it.
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
    spin?.succeed('Project minted!')

    // Remember the mint so later CLI invocations can nudge toward claiming before expiry. A
    // `--force`-superseded live project keeps its record — it may hold real content, and its
    // nudges should run until it is claimed or expires.
    recordMintedProject(minted)

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
      // `.env` already holds Sanity values and the CLI never edits an existing line — the file
      // is user-owned. The new credentials travel by hand: printed in human runs, carried by
      // the payload in JSON runs.
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
      // The superseded verified-expired project's ledger record is dropped now that its
      // replacement exists — a re-run then refuses (unverifiable credentials) instead of
      // quietly minting again and again against the rate cap. When the drop fails (an
      // unwritable user config — e.g. a sudo-owned file, or a sandboxed harness whose $HOME is
      // read-only), the surviving record would re-authorize the auto-proceed on every re-run,
      // so say so instead of failing open silently: the warning is what stops a blind retry
      // loop from draining the mint budget. Still fail-open — the mint succeeded and the
      // credentials are already delivered above.
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
      // Fresh directory: the one lane that writes, and it only ever appends. The mint already
      // succeeded — an unwritable `.env` (permissions, read-only mount) must never swallow the
      // only copy of the credentials. Show them and keep going.
      try {
        const written = appendEnvValues(envPath, envValues, {
          banner: [
            `Added by \`${invoked}\` — unclaimed Sanity project, expires ${minted.expiresAt}`,
            `Claim it to keep it: ${minted.claimUrl}`,
          ],
        })
        if (written.wroteKeys.length > 0) {
          flow.highlight(`Saved credentials to ./.env as ${written.wroteKeys.join(', ')}`)
        }
        if (written.skippedKeys.length > 0) {
          // The guard and the writer see blank lines differently: `SANITY_PROJECT_ID=` is
          // "absent" to the guard's dotenv read but "present" to the writer's line check, so a
          // template's blank leftovers land here — and a skipped SANITY_AUTH_TOKEN is the only
          // copy of the token. The writer never edits an existing line; hand the values over.
          flow.note(`./.env already has ${written.skippedKeys.join(', ')} — make sure they read:`)
          for (const key of written.skippedKeys) {
            flow.line(`${key}="${envValues[key as keyof typeof envValues]}"`)
          }
        }
      } catch (err) {
        this.warn(`Couldn't write ./.env (${err instanceof Error ? err.message : err})`)
        flow.highlight('Save these credentials yourself — they are not stored anywhere else:')
        printEnvValues()
      }
      flow.gap()
    }
    // Plain `--json` in a fresh directory stays write-free: the payload alone carries the
    // credentials, and the agent owns its own files.

    const hrs = hoursUntil(minted.expiresAt)
    flow.note(
      hrs
        ? `Claim your project within ${styleText('yellow', `~${hrs} hours`)} (by ${minted.expiresAt}) to keep it:`
        : `Claim your project before ${styleText('yellow', minted.expiresAt)} to keep it:`,
    )
    flow.line(hyperlink(styleText('cyan', minted.claimUrl), minted.claimUrl))
    flow.gap()
    flow.outro('Happy coding! 🚀')

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

  /**
   * The re-mint guardrail: minting only proceeds into a directory whose managed `.env` keys are
   * absent, belong to a verified-expired project, or are explicitly `--force`d. Every other
   * state aborts before the mint — protecting a live unclaimed project's claim window and the
   * provisioning rate cap alike. Nothing here is ever destructive: an existing `.env` is never
   * modified, so proceeding past existing keys only spends a mint — the new credentials are
   * printed (or carried in the JSON payload) for the caller to apply. Proceeding past a
   * verified-expired project without `--force` is deliberate: it is the expected recovery path
   * when an unclaimed project lapses under an agent or low-code integration. The guard applies
   * under `--json` as well — refusals surface as oclif's structured `{"error": …}` payload with
   * the `code` and `suggestions` intact.
   */
  private async guardExistingProject(envPath: string, invoked: string): Promise<GuardResult> {
    const existing = readEnvValues(envPath, [...GUARDED_ENV_KEYS])
    const foundKeys = GUARDED_ENV_KEYS.filter((key) => existing[key] !== undefined)
    if (foundKeys.length === 0) return {hasExistingKeys: false}
    if (this.flags.force) {
      return {hasExistingKeys: true}
    }

    const projectId = existing.SANITY_PROJECT_ID
    const record = projectId ? getMintedProjectRecord(projectId) : undefined
    // The ledger binds its claim token to this project id; a token parsed from
    // `SANITY_CLAIM_URL` is unbound — nothing proves the URL describes the credentials beside
    // it. Two lanes therefore demand the bound token: the expired auto-proceed (a stale URL must
    // never declare this directory's project dead and wave a mint through) and the claimed
    // refusal (its copy attributes the claim to this directory's project and advises removing
    // the token — advice unbound evidence can't justify). The live refusal stays open to unbound
    // evidence: refusing costs nothing, and surfacing the claim URL is the point of carrying it
    // cross-machine.
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
      // Live per the server — or the lookup failed, which also refuses: the local clock alone
      // is never evidence enough to declare a project dead (it may have been claimed since the
      // record was written, and an unreachable lookup host means the mint POST to the same host
      // was about to fail anyway). Only a server-verified expiry on a ledger-bound token
      // auto-proceeds. When the lookup did run, its expiry is the only one worth showing; a
      // stale local date or a null server expiry means no expiry clause at all.
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

    // Managed keys are present, but there is no way to verify what they belong to — a
    // hand-written .env, another machine's mint, or a claimed project whose token was removed.
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
