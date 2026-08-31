import {setTimeout as sleep} from 'node:timers/promises'

import {type Context} from '@sanity/client'

import {getJob} from '../../services/context.js'

const JOB_POLL_INTERVAL_MS = 5000

const TERMINAL_JOB_STATUSES: ReadonlySet<Context.Job['status']> = new Set([
  'cancelled',
  'failed',
  'succeeded',
])

/**
 * Poll a knowledge base job until it reaches a terminal state
 * (succeeded, failed or cancelled), resolving with the final job.
 */
export async function waitForJob(
  knowledgeBaseId: string,
  jobId: string,
  options?: {
    onPoll?: (job: Context.Job) => void
    pollIntervalMs?: number
  },
): Promise<Context.Job> {
  const pollIntervalMs = options?.pollIntervalMs ?? JOB_POLL_INTERVAL_MS

  for (;;) {
    const job = await getJob(knowledgeBaseId, jobId)
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      return job
    }
    options?.onPoll?.(job)
    await sleep(pollIntervalMs)
  }
}
