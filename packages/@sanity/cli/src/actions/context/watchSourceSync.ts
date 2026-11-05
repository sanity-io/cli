import {spinner} from '@sanity/cli-core/ux'

import {type Sync} from '../../services/context.js'
import {type SyncTarget, waitForSourceSync} from './waitForSourceSync.js'

/**
 * Error message for a sync that failed or was cancelled, e.g. "Sync failed: <reason>"
 */
export function formatSyncFailure(sync: Sync): string {
  return `Sync ${sync.status}${sync.error ? `: ${sync.error}` : ''}`
}

/**
 * Watch a source with a spinner until a sync newer than `previousSyncId`
 * settles, updating the spinner text with the sync status on each poll.
 *
 * Fails the spinner and rethrows on polling errors. A completed sync succeeds
 * the spinner, a held one warns, and a failed or cancelled one fails it;
 * turning the outcome into a command error (and exit code) is the caller's
 * responsibility.
 */
export async function watchSourceSync(
  knowledgeBaseId: string,
  sourceId: string,
  target: SyncTarget,
): Promise<Sync> {
  const label = 'Syncing source'
  const spin = spinner(label).start()

  let sync: Sync
  try {
    sync = await waitForSourceSync(knowledgeBaseId, sourceId, target, {
      onPoll: (pending) => {
        spin.text = `${label} (${pending?.status ?? 'waiting to start'})`
      },
    })
  } catch (error) {
    spin.fail(label)
    throw error
  }

  if (sync.status === 'completed') {
    spin.succeed('Sync completed')
  } else if (sync.status === 'held') {
    spin.warn('Sync held for confirmation')
  } else {
    spin.fail(label)
  }

  return sync
}
