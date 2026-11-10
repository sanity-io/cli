import {setTimeout as sleep} from 'node:timers/promises'

import {getSource, getSync, type Sync} from '../../services/context.js'
import {waitForJob} from './waitForJob.js'
import {formatJobFailure} from './watchJob.js'

const SYNC_POLL_INTERVAL_MS = 5000

const SETTLED_SYNC_STATUSES: ReadonlySet<Sync['status']> = new Set([
  'cancelled',
  'completed',
  'failed',
  'held',
])

/** The sync to follow: the one a request created, the job a `files` sync runs in, or a website or dataset sync queued on the source */
export type SyncTarget =
  | {jobId: string; syncId?: undefined}
  | {jobId?: undefined; previousSyncId: string | null; syncId?: undefined}
  | {jobId?: undefined; syncId: string}

/**
 * Poll until the sync a request created or queued settles (completed, failed,
 * cancelled, or held for confirmation), resolving with that sync. A known
 * sync is followed by its ID; a `files` sync through its job, whose result
 * names the sync. A website or dataset sync is queued behind any running sync
 * of its source and the request returns no ID for it, so it is the first
 * `latestSync` that isn't the one seen before the request.
 */
export async function waitForSourceSync(
  knowledgeBaseId: string,
  sourceId: string,
  target: SyncTarget,
  options: {onPoll?: (sync: Sync | null) => void; pollIntervalMs?: number} = {},
): Promise<Sync> {
  const pollIntervalMs = options.pollIntervalMs ?? SYNC_POLL_INTERVAL_MS
  let syncId = target.syncId

  if (target.jobId !== undefined) {
    const job = await waitForJob(knowledgeBaseId, target.jobId, {pollIntervalMs})
    const result: unknown = 'result' in job ? job.result : undefined
    const id =
      typeof result === 'object' && result !== null && 'syncId' in result
        ? result.syncId
        : undefined
    if (typeof id !== 'string') throw new Error(formatJobFailure('Sync', job))
    syncId = id
  }

  while (true) {
    let sync: Sync | null
    if (syncId === undefined) {
      const {latestSync} = await getSource(knowledgeBaseId, sourceId)
      const previous = 'previousSyncId' in target ? target.previousSyncId : null
      sync = latestSync && latestSync.id !== previous ? latestSync : null
    } else {
      sync = await getSync(knowledgeBaseId, sourceId, syncId)
    }
    if (sync && SETTLED_SYNC_STATUSES.has(sync.status)) {
      return sync
    }
    options.onPoll?.(sync)
    await sleep(pollIntervalMs)
  }
}
