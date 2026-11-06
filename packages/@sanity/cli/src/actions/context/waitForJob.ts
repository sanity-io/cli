import {setTimeout as sleep} from 'node:timers/promises'

import {getJob, type Job} from '../../services/context.js'

const JOB_POLL_INTERVAL_MS = 5000

const TERMINAL_JOB_STATUSES: ReadonlySet<Job['status']> = new Set([
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
    onPoll?: (job: Job) => void
    pollIntervalMs?: number
  },
): Promise<Job> {
  const pollIntervalMs = options?.pollIntervalMs ?? JOB_POLL_INTERVAL_MS

  while (true) {
    const job = await getJob(knowledgeBaseId, jobId)
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      return job
    }
    options?.onPoll?.(job)
    await sleep(pollIntervalMs)
  }
}
