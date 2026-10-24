import {spinner} from '@sanity/cli-core/ux'
import {type Context} from '@sanity/client'

import {waitForSourceSync} from './waitForSourceSync.js'

/**
 * Error message for a sync that failed or was cancelled, e.g. "Sync failed: <reason>"
 */
export function formatSyncFailure(sync: Context.Sync): string {
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
  previousSyncId: string | null,
): Promise<Context.Sync> {
  const label = 'Syncing source'
  const spin = spinner(label).start()

  let sync: Context.Sync
  try {
    sync = await waitForSourceSync(knowledgeBaseId, sourceId, {
      onPoll: (pending) => {
        spin.text = `${label} (${pending?.status ?? 'waiting to start'})`
      },
      previousSyncId,
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
