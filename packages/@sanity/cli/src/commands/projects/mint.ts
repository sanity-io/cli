import {styleText} from 'node:util'

import {Args} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {logSymbols} from '@sanity/cli-core/ux'

import {mintUnclaimedProject} from '../../services/mintProject.js'

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
      description: 'Mint an unclaimed project with a default name',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My New Project"',
      description: 'Mint an unclaimed project named "My New Project"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Mint a project and output the token and claim details as JSON',
    },
  ]

  static override hiddenAliases: string[] = ['project:mint']

  public async run(): Promise<MintProjectResult> {
    // Under `--json` oclif suppresses `this.log` (which `output.log` is bound to) and prints the
    // returned `MintProjectResult` instead, so these human-facing lines only appear in
    // interactive runs — the structured payload owns stdout in JSON mode.
    const {output} = this

    const displayName = this.args.projectName?.trim() || 'My Sanity project'
    const minted = await mintUnclaimedProject({displayName})
    const hrs = hoursUntil(minted.expiresAt)

    output.log(`${logSymbols.success} Your project is live now.`)
    output.log('')
    output.log(`Project ID: ${styleText('cyan', minted.resourceId)}`)
    output.log(`Dataset:    ${styleText('cyan', minted.datasetName)}`)
    output.log('')
    output.log(
      hrs
        ? `Claim it within ${styleText('yellow', `~${hrs} hours`)} (by ${minted.expiresAt}) to keep it permanently:`
        : `Claim it before ${styleText('yellow', minted.expiresAt)} to keep it permanently:`,
    )
    output.log(styleText('cyan', minted.claimUrl))
    output.log('')

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
