import fs from 'node:fs'
import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {input} from '@sanity/cli-core/ux'

import {mintUnclaimedProject} from '../../services/mintProject.js'
import {recordMintedProject} from '../../util/claimNudges.js'
import {appendEnvValues} from '../../util/envFile.js'
import {createFlow} from '../../util/flowOutput.js'
import {renderNewCommandSplash} from '../../util/newCommandSplash.js'
import {hyperlink} from '../../util/terminalLink.js'

const DEFAULT_PROJECT_NAME = 'My Sanity project'

function hoursUntil(iso: string): number | undefined {
  const ms = new Date(iso).getTime() - Date.now()
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 3_600_000) : undefined
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
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Mint a project and output the token and claim details as JSON',
    },
  ]

  static override flags = {
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
    // structured payload owns stdout in JSON mode, and JSON mode leaves the filesystem untouched
    // (the payload itself carries the credentials).
    const {output} = this
    const json = this.jsonEnabled()
    const flow = createFlow(output.log)
    // How this command was invoked (`sanity new` vs `sanity projects mint`), for self-referencing copy.
    const invoked = [this.config.bin, ...(this.id?.split(':') ?? [])].join(' ')

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

    const envPath = path.join(process.cwd(), '.env')
    if (!json) {
      flow.note(
        fs.existsSync(envPath)
          ? 'Found an existing .env file, adding to it.'
          : 'No .env file found, creating one.',
      )
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

    // Remember the mint so later CLI invocations can nudge toward claiming before expiry.
    recordMintedProject(minted)

    flow.gap()
    flow.result(`Project ID: ${styleText('cyan', minted.resourceId)}`)
    flow.result(`Dataset:    ${styleText('cyan', minted.datasetName)}`)
    flow.gap()

    if (!json) {
      const written = appendEnvValues(
        envPath,
        {
          SANITY_API_TOKEN: minted.token,
          SANITY_DATASET: minted.datasetName,
          SANITY_PROJECT_ID: minted.resourceId,
        },
        {
          banner: [
            `Added by \`${invoked}\` — unclaimed Sanity project, expires ${minted.expiresAt}`,
            `Claim it to keep it: ${minted.claimUrl}`,
          ],
        },
      )
      if (written.wroteKeys.length > 0) {
        flow.highlight(`Saved credentials to ./.env as ${written.wroteKeys.join(', ')}`)
      }
      if (written.skippedKeys.length > 0) {
        flow.note(`Left existing ${written.skippedKeys.join(', ')} in ./.env untouched.`)
      }
      flow.gap()
    }

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
    }
  }
}
