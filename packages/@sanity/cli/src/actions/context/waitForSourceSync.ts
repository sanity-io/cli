import {setTimeout as sleep} from 'node:timers/promises'

import {type Context} from '@sanity/client'

import {getSource} from '../../services/context.js'

const SYNC_POLL_INTERVAL_MS = 5000

const SETTLED_SYNC_STATUSES: ReadonlySet<Context.Sync['status']> = new Set([
  'cancelled',
  'completed',
  'failed',
  'held',
])

/**
 * Poll a source until a sync newer than `previousSyncId` settles (completed,
 * failed, cancelled, or held for confirmation), resolving with that sync.
 * A website or dataset sync waits for any running sync of its source, so the
 * sync to follow is the first `latestSync` that isn't the one seen before it
 * was requested.
 */
export async function waitForSourceSync(
  knowledgeBaseId: string,
  sourceId: string,
  options: {
    onPoll?: (sync: Context.Sync | null) => void
    pollIntervalMs?: number
    previousSyncId: string | null
  },
): Promise<Context.Sync> {
  const pollIntervalMs = options.pollIntervalMs ?? SYNC_POLL_INTERVAL_MS

  while (true) {
    const {latestSync} = await getSource(knowledgeBaseId, sourceId)
    const sync = latestSync && latestSync.id !== options.previousSyncId ? latestSync : null
    if (sync && SETTLED_SYNC_STATUSES.has(sync.status)) {
      return sync
    }
    options.onPoll?.(sync)
    await sleep(pollIntervalMs)
  }
}
