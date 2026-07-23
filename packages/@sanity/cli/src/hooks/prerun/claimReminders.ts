import {type Hook} from '@oclif/core'
import {subdebug} from '@sanity/cli-core/debug'

import {runClaimNudges} from '../../util/claimNudges.js'

const debug = subdebug('claimNudges')

/**
 * Commands that already put claim details front and center — nudging during them is noise.
 */
const SKIP_COMMANDS = new Set(['new', 'project:mint', 'projects:mint'])

/**
 * Prerun hook that reminds the user (or their agent) about minted-but-unclaimed projects
 * approaching the end of their claim window. Writes to stderr so it never corrupts
 * machine-readable stdout (e.g. `--json`), and silently fails — a reminder must never break the
 * command being run.
 */
export const claimReminders: Hook.Prerun = async function (opts) {
  if (SKIP_COMMANDS.has(opts.Command?.id ?? '')) return

  try {
    await runClaimNudges((line) => process.stderr.write(`${line}\n`))
  } catch (err) {
    debug('claim reminder check failed: %s', err)
  }
}
